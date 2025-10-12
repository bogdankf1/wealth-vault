"""
Configuration models for admin panel settings.
"""
from sqlalchemy import Column, String, Text, Boolean, JSON
from app.models.base import BaseModel


class AppConfiguration(BaseModel):
    """
    App-wide configuration settings.
    Stores dynamic configuration that admins can modify without code changes.
    """

    __tablename__ = "app_configuration"

    key = Column(String(100), unique=True, nullable=False, index=True)  # default_widgets, default_categories, etc.
    value = Column(JSON, nullable=False)  # JSON value for flexibility
    description = Column(Text, nullable=True)  # Human-readable description
    is_system = Column(Boolean, default=False, nullable=False)  # System configs can't be deleted

    def __repr__(self) -> str:
        return f"<AppConfiguration(key={self.key})>"


class EmailTemplate(BaseModel):
    """
    Email template configuration.
    Stores customizable email templates for various system emails.
    """

    __tablename__ = "email_templates"

    name = Column(String(100), unique=True, nullable=False, index=True)  # welcome_email, subscription_renewal, etc.
    subject = Column(String(255), nullable=False)
    html_content = Column(Text, nullable=False)
    text_content = Column(Text, nullable=True)  # Plain text fallback
    variables = Column(JSON, nullable=True)  # Available template variables
    is_active = Column(Boolean, default=True, nullable=False)

    def __repr__(self) -> str:
        return f"<EmailTemplate(name={self.name}, subject={self.subject})>"
