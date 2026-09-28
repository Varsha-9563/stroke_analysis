"""
Sends emails (e.g. the discharge message) through any SMTP server.

To actually send emails, set these environment variables before starting uvicorn
(example for Gmail - use an "App password", not your normal password):

  Windows PowerShell:
    $env:SMTP_HOST="smtp.gmail.com"
    $env:SMTP_PORT="587"
    $env:SMTP_USER="yourname@gmail.com"
    $env:SMTP_PASSWORD="your-16-char-app-password"

If they are NOT set, the email is just printed in the uvicorn terminal,
so everything else still works during development.
"""
import os
import smtplib
from email.message import EmailMessage


def send_email(to: str, subject: str, body: str):
    host = os.getenv("SMTP_HOST")
    user = os.getenv("SMTP_USER")
    password = os.getenv("SMTP_PASSWORD")
    port = int(os.getenv("SMTP_PORT", "587"))

    if not (host and user and password):
        print("\n----- EMAIL (not sent: SMTP not configured) -----")
        print(f"To: {to}\nSubject: {subject}\n\n{body}")
        print("-------------------------------------------------\n")
        return

    msg = EmailMessage()
    msg["From"] = user
    msg["To"] = to
    msg["Subject"] = subject
    msg.set_content(body)
    try:
        with smtplib.SMTP(host, port, timeout=20) as smtp:
            smtp.starttls()
            smtp.login(user, password)
            smtp.send_message(msg)
        print(f"Email sent to {to}")
    except Exception as e:  # never crash the API because of email
        print(f"Email to {to} FAILED: {e}")
