import pytest
from unittest.mock import MagicMock, patch
from supabase_client import create_job, update_job, get_job, verify_user_token, save_analysis, upload_report_file

# ─── Mocking Supabase Chain ───

def mock_supabase_chain(data=None, error=None):
    mock = MagicMock()
    mock.table.return_value = mock
    mock.select.return_value = mock
    mock.insert.return_value = mock
    mock.update.return_value = mock
    mock.delete.return_value = mock
    mock.eq.return_value = mock
    mock.single.return_value = mock
    mock.order.return_value = mock
    mock.limit.return_value = mock
    mock.execute.return_value = MagicMock(data=data)
    return mock

# ─── Tests ───

@patch("supabase_client._get_admin_client")
def test_create_job_persistence(mock_client):
    """Case 42: Job creation in 'jobs' table."""
    mock_client.return_value = mock_supabase_chain(data=[{"id": "test-job"}])
    
    success = create_job("job_123", "user_abc", ["file.pdf"])
    
    assert success is True
    # Verify the correctly mapped fields were sent
    insert_call = mock_client.return_value.table.return_value.insert.call_args[0][0]
    assert insert_call["job_id"] == "job_123"
    assert insert_call["user_id"] == "user_abc"

@patch("supabase_client._get_admin_client")
def test_update_job_status(mock_client):
    """Case 51: Update job status from 'running' to 'completed'."""
    mock_client.return_value = mock_supabase_chain()
    
    success = update_job("job_123", status="completed", progress=[{"step": "done"}])
    
    assert success is True
    update_call = mock_client.return_value.table.return_value.update.call_args[0][0]
    assert update_call["status"] == "completed"

@patch("supabase_client._get_admin_client")
def test_get_job_missing(mock_client):
    """Case 52: Clean up / handle failed job entries (missing row)."""
    # single().execute() raises Exception if not found in many client versions, 
    # or Returns dummy with empty data. Our code catches Exception.
    mock_client.return_value.table.return_value.select.return_value.eq.return_value.single.return_value.execute.side_effect = Exception("Not found")
    
    job = get_job("non-existent")
    assert job is None

@patch("supabase_client._get_client")
def test_verify_user_token_valid(mock_client):
    """Case 41: JWT Token verification (Valid)."""
    mock_auth = MagicMock()
    mock_auth.get_user.return_value = MagicMock(user=MagicMock(id="uuid", email="test@me.com", created_at="now"))
    mock_client.return_value.auth = mock_auth
    
    user = verify_user_token("good-token")
    assert user["id"] == "uuid"
    assert user["email"] == "test@me.com"

@patch("supabase_client._get_client")
def test_verify_user_token_invalid(mock_client):
    """Case 41: JWT Token verification (Expired/Invalid)."""
    mock_auth = MagicMock()
    mock_auth.get_user.side_effect = Exception("Invalid token")
    mock_client.return_value.auth = mock_auth
    
    user = verify_user_token("bad-token")
    assert user is None

@patch("supabase_client._get_admin_client")
def test_save_analysis_success(mock_client):
    """Case 44: Analysis history saving with correct mapping."""
    mock_client.return_value = mock_supabase_chain(data=[{"id": 1}])
    
    result = save_analysis(
        user_id="u1",
        company_name="Corp",
        job_id="j1",
        analysis_data={"recommendation": {"recommendation": "Buy"}},
        filenames=["a.pdf"]
    )
    
    assert result["id"] == 1
    # Verify R' Score fields were mapped
    insert_call = mock_client.return_value.table.return_value.insert.call_args[0][0]
    assert insert_call["company_name"] == "Corp"
    assert insert_call["recommendation"] == "Buy"

@patch("supabase_client._get_admin_client")
def test_upload_report_storage(mock_client):
    """Case 46: File upload to Supabase Storage."""
    mock_storage = MagicMock()
    mock_client.return_value.storage = mock_storage
    
    # Mock file context manager
    with patch("builtins.open", MagicMock()):
        path = upload_report_file("user1", "job1", "/tmp/fake.docx")
    assert path == "user1/job1.docx"
    assert mock_storage.from_.return_value.upload.called

@patch("supabase_client._get_admin_client")
def test_get_job_corrupt_jsonb(mock_client):
    """Case 141, 142: Simulating parsing errors from deeply nested/corrupted JSONB."""
    # Supabase might return half-written strings if the column types are forced or mapped
    # In python it's a dict, but let's pass an outright list where it expects a dict for result
    mock_client.return_value.table.return_value.select.return_value.eq.return_value.single.return_value.execute.return_value = MagicMock(
        data={"job_id": "bad", "status": "running", "result": ["I am a list not a dict"]}
    )
    job = get_job("bad")
    # Python code should just return whatever it is without crashing 
    assert job["result"] == ["I am a list not a dict"]

@patch("supabase_client._get_admin_client")
def test_create_job_db_timeout(mock_client):
    """Case 143, 144: Timeouts during job creation mimicking network drop."""
    import httpx
    mock_client.return_value.table.return_value.insert.return_value.execute.side_effect = httpx.TimeoutException("DB Offline")
    
    success = create_job("job_timeout", "u1", ["a.pdf"])
    # Exception is caught and returns False
    assert success is False
