import os
from datetime import timedelta
from pickle import TRUE

class Config:
    """Base configuration"""
    HOST = os.environ.get('HOST') or 'localhost'
    PORT = os.environ.get('PORT') or 5000
    DEBUG = os.environ.get('DEBUG') or TRUE
    SECRET_KEY = os.environ.get('SECRET_KEY') or 'dev-secret-key-change-in-production'
    SQLALCHEMY_DATABASE_URI = os.environ.get('DATABASE_URL') or 'sqlite:///ip_vlan_manager.db'
    SQLALCHEMY_TRACK_MODIFICATIONS = False
    PERMANENT_SESSION_LIFETIME = timedelta(hours=24)

