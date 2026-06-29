import logging
from sendgrid import SendGridAPIClient
from sendgrid.helpers.mail import Mail

from app.config import get_settings

logger = logging.getLogger(__name__)

class EmailDeliveryError(Exception):
    """Raised when an email fails to dispatch to the provider."""
    pass

def send_email(to_email: str, subject: str, html_body: str) -> str:
    """
    Dispatches an HTML email via SendGrid.
    
    Returns:
        The provider's message ID if available, else the HTTP status code as a string.
        
    Raises:
        EmailDeliveryError: If the provider returns a non-2xx status code or a network error occurs.
    """
    settings = get_settings()
    
    if not settings.SENDGRID_API_KEY or not settings.SENDGRID_FROM_EMAIL:
        raise EmailDeliveryError("SendGrid is not configured (missing API key or From email).")
        
    message = Mail(
        from_email=settings.SENDGRID_FROM_EMAIL,
        to_emails=to_email,
        subject=subject,
        html_content=html_body
    )
    
    try:
        sg = SendGridAPIClient(settings.SENDGRID_API_KEY)
        response = sg.send(message)
        
        if response.status_code >= 400:
            raise EmailDeliveryError(f"SendGrid returned {response.status_code}: {response.body}")
            
        # Extract message ID from headers if available
        msg_id = response.headers.get("X-Message-Id")
        if not msg_id:
            # Fall back to status code since the API is asynchronous and doesn't always return ID inline
            msg_id = f"status_{response.status_code}"
            
        return msg_id
        
    except Exception as e:
        logger.error(f"Failed to send email to {to_email}: {e}")
        raise EmailDeliveryError(str(e))
