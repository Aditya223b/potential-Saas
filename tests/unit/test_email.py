import pytest
from unittest.mock import MagicMock, patch, mock_open
from email_sender import send_report_email

@patch("smtplib.SMTP")
@patch("os.path.exists", return_value=True)
@patch("builtins.open", new_callable=mock_open, read_data=b"data")
def test_send_email_success(mock_file, mock_exists, mock_smtp):
    """Case 96: Successful SMTP delivery."""
    mock_inst = MagicMock()
    mock_smtp.return_value.__enter__.return_value = mock_inst
    
    with patch("config._get") as mock_get:
        mock_get.side_effect = lambda key, default="": "test@me.com" if "EMAIL" in key or "PASSWORD" in key else default
        success = send_report_email("target@you.com", "Test Corp", "/tmp/path.docx", "Summary", "Buy")
        assert success is True
        assert mock_inst.send_message.called

@patch("smtplib.SMTP")
@patch("os.path.exists", return_value=True)
@patch("builtins.open", new_callable=mock_open, read_data=b"data")
def test_send_email_auth_failure(mock_file, mock_exists, mock_smtp):
    """Case 97: Handling of SMTP Authentication errors."""
    import smtplib
    mock_inst = MagicMock()
    mock_inst.login.side_effect = smtplib.SMTPAuthenticationError(535, "Auth failed")
    mock_smtp.return_value.__enter__.return_value = mock_inst
    
    with patch("config._get", return_value="val"):
        success = send_report_email("target@you.com", "Test Corp", "/tmp/path.docx", "Summary", "Buy")
        assert success is False

@patch("smtplib.SMTP")
def test_send_email_missing_config(mock_smtp):
    """Case 98: Graceful failure when SMTP env vars are missing."""
    with patch("config._get", return_value=""):
        with pytest.raises(RuntimeError, match="Email sending requires"):
            send_report_email("t@t.com", "C", "P", "S", "B")
