import json
import pytest
from unittest.mock import MagicMock, patch
import fakeredis

# Patch redis.from_url before app module load
patch("redis.from_url", return_value=fakeredis.FakeRedis(decode_responses=True)).start()
from app import app, AnalysisJob, redis_conn, q

@pytest.fixture
def client():
    app.config["TESTING"] = True
    with app.test_client() as client:
        yield client

# ─── Tests ───

def test_health_check(client):
    """Case 65: Health check endpoint response."""
    resp = client.get("/")
    assert resp.status_code == 200
    assert b"Analysis" in resp.data

@patch("supabase_client.verify_user_token")
def test_upload_no_files(mock_verify, client):
    """Case 57: /api/upload with no files."""
    mock_verify.return_value = {"id": "123"}
    resp = client.post("/api/upload", headers={"Authorization": "Bearer token"})
    assert resp.status_code == 400
    assert b"No files" in resp.data

@patch("rq.Queue.enqueue")
@patch("supabase_client.create_job")
@patch("supabase_client.verify_user_token")
def test_upload_success(mock_verify, mock_create, mock_queue, client):
    """Case 56: /api/upload success path (Auth + Queue)."""
    mock_verify.return_value = {"id": "123"}
    mock_create.return_value = True
    
    # Simulate a file upload
    from io import BytesIO
    data = {
        "pdfs": (BytesIO(b"fake content"), "test.pdf")
    }
    resp = client.post("/api/upload", 
                       data=data, 
                       content_type="multipart/form-data",
                       headers={"Authorization": "Bearer token"})
    
    assert resp.status_code == 200
    data = json.loads(resp.data)
    assert "job_id" in data
    assert mock_queue.called

def test_get_progress_job_not_found(client):
    """Case 60: /api/progress SSE when job not found in memory or DB."""
    with patch("supabase_client.get_job", return_value=None):
        resp = client.get("/api/progress/missing_id")
        # SSE returns a generator, so we check the first chunk
        for chunk in resp.response:
            assert b"Job not found" in chunk
            break

def test_get_result_memory_success(client):
    """Case 61: /api/result retrieval from redis."""
    job_id = "test_res"
    job = AnalysisJob(job_id, ["a.pdf"])
    job.status = "completed"
    job.result = {"score": 100}
    redis_conn.setex(f"job_state:{job_id}", 300, json.dumps(job.to_dict()))
    
    resp = client.get(f"/api/result/{job_id}")
    assert resp.status_code == 200
    data = json.loads(resp.data)
    assert data["status"] == "completed"
    assert data["result"]["score"] == 100

@patch("supabase_client.get_job")
def test_get_result_supabase_fallback(mock_get_job, client):
    """Case 59, 61: /api/result fallback to Supabase (container restart)."""
    job_id = "restarted_job"
    redis_conn.delete(f"job_state:{job_id}")
    
    # Mock data from DB
    mock_get_job.return_value = {
        "job_id": job_id,
        "status": "completed",
        "result": {"from_db": True}
    }
    
    resp = client.get(f"/api/result/{job_id}")
    assert resp.status_code == 200
    data = json.loads(resp.data)
    assert data["result"]["from_db"] is True

@patch("rate_limiter.rate_limiter.status")
@patch("supabase_client.verify_user_token")
def test_rate_limit_status_route(mock_verify, mock_status, client):
    """Case 63: /api/rate-limit-status for authenticated user."""
    mock_verify.return_value = {"id": "u123"}
    mock_status.return_value = {"remaining": 5}
    
    resp = client.get("/api/rate-limit-status", headers={"Authorization": "Bearer tok"})
    assert resp.status_code == 200
    assert json.loads(resp.data)["remaining"] == 5

@patch("supabase_client.verify_user_token", return_value=None)
def test_auth_required_middleware(mock_verify, client):
    """Case 58, 67: Unauthorized access to protected route."""
    resp = client.post("/api/save/job1", headers={"Authorization": "Bearer invalid"})
    assert resp.status_code == 401
    assert b"Invalid or expired token" in resp.data

@patch("supabase_client.verify_user_token")
@patch("app.run_extraction_pipeline", return_value=None)
def test_upload_huge_file_bound_mock(mock_pipeline, mock_verify, client):
    """Case 121, 122: Testing upload bounds limits for huge files."""
    mock_verify.return_value = {"id": "123"}
    from io import BytesIO
    # Simulating massive text buffer within memory limits
    data = {"pdfs": (BytesIO(b"A" * 10**7), "huge.pdf")}
    resp = client.post("/api/upload", data=data, content_type="multipart/form-data", headers={"Authorization": "Bearer token"})
    # It should pass without memory crash unless Flask limits it
    assert resp.status_code in [200, 413]

def test_get_progress_sse_disconnect(client):
    """Case 123, 124: SSE Client disconnect simulation."""
    import app
    job_id = "test_sse_disc"
    mock_job = app.AnalysisJob(job_id, ["a.pdf"])
    mock_job.status = "completed"  # Break loop instantly
    redis_conn.setex(f"job_state:{job_id}", 300, json.dumps(mock_job.to_dict()))
    resp = client.get(f"/api/progress/{job_id}")
    iterator = iter(resp.response)
    first_yield = next(iterator)
    assert b"data:" in first_yield
    resp.close()

def test_api_result_sql_injection_attempt(client):
    """Case 125, 126: Passing SQLi payloads into job_id routes."""
    # Supabase uses parameterized queries but the route itself shouldn't crash
    resp = client.get("/api/result/1' OR '1'='1")
    assert resp.status_code == 404
    
def test_jwt_completely_expired(client):
    """Case 127, 128: JWT completely expired edge case."""
    with patch("supabase_client.verify_user_token", return_value=None):
        resp = client.post("/api/save/job1", headers={"Authorization": "Bearer deeply_expired"})
        assert resp.status_code == 401

@patch("supabase_client.verify_user_token")
@patch("supabase_client.create_job", return_value=True)
@patch("rq.Queue.enqueue", return_value=None)
def test_concurrent_upload_abuse(mock_queue, mock_create, mock_verify, client):
    """Case 129, 130: Concurrent POST simulation against endpoint."""
    mock_verify.return_value = {"id": "concurrent_user"}
    from io import BytesIO
    # Sequential hits simulating flooding
    for _ in range(5):
        resp = client.post(
            "/api/upload",
            data={"pdfs": (BytesIO(b"data"), "test.pdf")},
            content_type="multipart/form-data",
            headers={"Authorization": "Bearer token"}
        )
        assert resp.status_code == 200
