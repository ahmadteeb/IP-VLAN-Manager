from flask_sqlalchemy import SQLAlchemy
from flask_login import UserMixin
from werkzeug.security import generate_password_hash, check_password_hash
from datetime import datetime
from sqlalchemy import UniqueConstraint, Enum, Boolean
import enum

db = SQLAlchemy()



class Technology(db.Model):
    __tablename__ = 'technologies'

    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100), unique=True, nullable=False, index=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    def to_dict(self):
        return {
            'id': self.id,
            'name': self.name,
            'created_at': self.created_at.isoformat() if self.created_at else None
        }

class StatusType(enum.Enum):
    FREE = "free"
    ASSIGNED = "assigned"

class UserRole(enum.Enum):
    ADMIN = "admin"
    ENGINEER = "engineer"
    READ_ONLY = "read_only"

class Vendor(db.Model):
    __tablename__ = 'vendors'
    
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100), unique=True, nullable=False, index=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    
    # Relationships
    ips = db.relationship('IP', backref='vendor_obj', lazy=True)
    vlans = db.relationship('VLAN', backref='vendor_obj', lazy=True)
    sites = db.relationship('Site', backref='vendor_obj', lazy=True)
    
    def to_dict(self):
        """Convert Vendor to dictionary"""
        return {
            'id': self.id,
            'name': self.name,
            'created_at': self.created_at.isoformat() if self.created_at else None
        }
    
    def __repr__(self):
        return f'<Vendor {self.name}>'

class User(UserMixin, db.Model):
    __tablename__ = 'users'
    
    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(80), unique=True, nullable=False, index=True)
    password_hash = db.Column(db.String(255), nullable=False)
    role = db.Column(db.Enum(UserRole), nullable=False, default=UserRole.ENGINEER)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    
    def set_password(self, password):
        """Hash and set password"""
        self.password_hash = generate_password_hash(password)
    
    def check_password(self, password):
        """Check password against hash"""
        return check_password_hash(self.password_hash, password)
    
    def is_admin(self):
        """Check if user is admin"""
        return self.role == UserRole.ADMIN
    
    def is_read_only(self):
        """Check if user is read-only"""
        return self.role == UserRole.READ_ONLY
    
    def __repr__(self):
        return f'<User {self.username}>'

class PasswordState(db.Model):
    __tablename__ = 'password_states'

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False, unique=True, index=True)
    must_change = db.Column(Boolean, nullable=False, default=True)
    last_changed = db.Column(db.DateTime, nullable=True)

    user = db.relationship('User', backref=db.backref('password_state', uselist=False))

    def __repr__(self):
        return f'<PasswordState user_id={self.user_id} must_change={self.must_change}>'

class Router(db.Model):
    __tablename__ = 'routers'
    
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(200), unique=True, nullable=False, index=True)
    router_ip = db.Column(db.String(45), nullable=False, index=True)
    router_type = db.Column(db.String(100), nullable=False)
    description = db.Column(db.String(500))
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    
    # Relationship to interfaces
    interfaces = db.relationship('Interface', backref='router', lazy=True, cascade='all, delete-orphan')
    
    def to_dict(self):
        """Convert Router to dictionary"""
        return {
            'id': self.id,
            'name': self.name,
            'router_ip': self.router_ip,
            'router_type': self.router_type,
            'description': self.description,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'interface_count': len(self.interfaces) if self.interfaces else 0
        }
    
    def __repr__(self):
        return f'<Router {self.name}>'

class Interface(db.Model):
    __tablename__ = 'interfaces'
    
    id = db.Column(db.Integer, primary_key=True)
    router_id = db.Column(db.Integer, db.ForeignKey('routers.id'), nullable=False, index=True)
    name = db.Column(db.String(200), nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    
    # Relationships
    sites = db.relationship('Site', backref='interface', lazy=True)
    
    # Unique constraint: router + interface name must be unique
    __table_args__ = (
        UniqueConstraint('router_id', 'name', name='uq_router_interface'),
    )
    
    def to_dict(self):
        """Convert Interface to dictionary"""
        return {
            'id': self.id,
            'router_id': self.router_id,
            'router_name': self.router.name if self.router else None,
            'name': self.name,
            'created_at': self.created_at.isoformat() if self.created_at else None
        }
    
    def __repr__(self):
        return f'<Interface {self.name} on {self.router.name if self.router else "Unknown"}>'

class IP(db.Model):
    __tablename__ = 'ips'
    
    id = db.Column(db.Integer, primary_key=True)
    gateway = db.Column(db.String(45), unique=True, nullable=False, index=True)
    subnet_mask = db.Column(db.String(45))
    type = db.Column(db.String(100), nullable=False, index=True)
    vendor = db.Column(db.String(100), nullable=True, index=True)  # Keep for backward compatibility
    vendor_id = db.Column(db.Integer, db.ForeignKey('vendors.id'), nullable=True, index=True)
    status = db.Column(db.Enum(StatusType), nullable=False, default=StatusType.FREE, index=True)
    assigned_date = db.Column(db.DateTime)
    
    # Pair fields for service/OM pairing
    pair_id = db.Column(db.String(100), nullable=True, index=True)  # Links service and OM IPs together
    pair_type = db.Column(db.String(20), nullable=True, index=True)  # 'service' or 'om'
    
    # Relationship to sites
    sites_service = db.relationship('Site', backref='service_ip', lazy=True, foreign_keys='Site.service_ip_id')
    sites_om = db.relationship('Site', backref='om_ip', lazy=True, foreign_keys='Site.om_ip_id')
    
    def to_dict(self):
        """Convert IP to dictionary"""
        # Get the site that uses this IP (if any)
        site_service = self.sites_service[0] if self.sites_service else None
        site_om = self.sites_om[0] if self.sites_om else None
        site = site_service or site_om
        
        # Find pair IP if exists
        pair_ip = None
        if self.pair_id:
            pair_type = 'om' if self.pair_type == 'service' else 'service'
            pair_ip = IP.query.filter_by(pair_id=self.pair_id, pair_type=pair_type).first()
        
        return {
            'id': self.id,
            'gateway': self.gateway,
            'subnet_mask': self.subnet_mask,
            'type': self.type,
            'vendor': self.vendor_obj.name if self.vendor_obj else self.vendor,
            'vendor_id': self.vendor_id,
            'status': self.status.value if self.status else None,
            'assigned_date': self.assigned_date.isoformat() if self.assigned_date else None,
            'pair_id': self.pair_id,
            'pair_type': self.pair_type,
            'pair_ip_id': pair_ip.id if pair_ip else None,
            'pair_gateway': pair_ip.gateway if pair_ip else None,
            'pair_subnet_mask': pair_ip.subnet_mask if pair_ip else None,
            'site_name': site.site_name if site else None,
            'site_id': site.site_id if site else None
        }
    
    def __repr__(self):
        return f'<IP {self.gateway}>'

class VLAN(db.Model):
    __tablename__ = 'vlans'
    
    id = db.Column(db.Integer, primary_key=True)
    vlan_id = db.Column(db.Integer, nullable=False, index=True)  # Removed unique constraint to allow reuse
    type = db.Column(db.String(100), nullable=False, index=True)
    vendor = db.Column(db.String(100), nullable=True, index=True)  # Keep for backward compatibility
    vendor_id = db.Column(db.Integer, db.ForeignKey('vendors.id'), nullable=True, index=True)
    status = db.Column(db.Enum(StatusType), nullable=False, default=StatusType.FREE, index=True)
    assigned_date = db.Column(db.DateTime)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    
    # Pair fields for service/OM pairing
    pair_id = db.Column(db.String(100), nullable=True, index=True)  # Links service and OM VLANs together
    pair_type = db.Column(db.String(20), nullable=True, index=True)  # 'service' or 'om'
    
    # Relationship to sites
    sites_service = db.relationship('Site', backref='service_vlan', lazy=True, foreign_keys='Site.service_vlan_id')
    sites_om = db.relationship('Site', backref='om_vlan', lazy=True, foreign_keys='Site.om_vlan_id')
    
    def to_dict(self):
        """Convert VLAN to dictionary"""
        # Get the site that uses this VLAN (if any)
        site_service = self.sites_service[0] if self.sites_service else None
        site_om = self.sites_om[0] if self.sites_om else None
        site = site_service or site_om
        
        # Find pair VLAN if exists
        pair_vlan = None
        if self.pair_id:
            pair_type = 'om' if self.pair_type == 'service' else 'service'
            pair_vlan = VLAN.query.filter_by(pair_id=self.pair_id, pair_type=pair_type).first()
        
        return {
            'id': self.id,
            'vlan_id': self.vlan_id,
            'type': self.type,
            'vendor': self.vendor_obj.name if self.vendor_obj else self.vendor,
            'vendor_id': self.vendor_id,
            'status': self.status.value if self.status else None,
            'assigned_date': self.assigned_date.isoformat() if self.assigned_date else None,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'pair_id': self.pair_id,
            'pair_type': self.pair_type,
            'pair_vlan_id': pair_vlan.id if pair_vlan else None,
            'pair_vlan_number': pair_vlan.vlan_id if pair_vlan else None,
            'site_name': site.site_name if site else None,
            'site_id': site.site_id if site else None
        }
    
    def __repr__(self):
        return f'<VLAN {self.vlan_id}>'

class Site(db.Model):
    __tablename__ = 'sites'
    
    id = db.Column(db.Integer, primary_key=True)
    site_id = db.Column(db.String(100), nullable=False, index=True)  # Removed unique constraint - same site_id can be used for different technologies
    site_name = db.Column(db.String(200), nullable=False, index=True)
    technology_type = db.Column(db.String(100), nullable=True, index=True)
    # NOTE: The legacy JSON "technologies" column has been removed in favor of single "technology_type"
    # to simplify the data model. If the physical DB column still exists, create a migration to drop it.
    # Example Alembic migration snippet (for reference only, not executed here):
    # op.drop_column('sites', 'technologies')

    # The legacy string "vendor" column has been removed; use vendor_id / Vendor relationship instead.
    # If the physical DB column still exists, create a migration to drop it:
    # op.drop_column('sites', 'vendor')
    vendor_id = db.Column(db.Integer, db.ForeignKey('vendors.id'), nullable=True, index=True)
    
    # Pair fields for service and OM
    service_ip_id = db.Column(db.Integer, db.ForeignKey('ips.id'), nullable=True, index=True)
    om_ip_id = db.Column(db.Integer, db.ForeignKey('ips.id'), nullable=True, index=True)
    service_vlan_id = db.Column(db.Integer, db.ForeignKey('vlans.id'), nullable=True, index=True)
    om_vlan_id = db.Column(db.Integer, db.ForeignKey('vlans.id'), nullable=True, index=True)
    
    interface_id = db.Column(db.Integer, db.ForeignKey('interfaces.id'), nullable=True, index=True)
    assigned_date = db.Column(db.DateTime, default=datetime.utcnow)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    
    def to_dict(self):
        """Convert Site to dictionary"""
        # Technologies: since we now store a single technology per site in "technology_type",
        # expose a technologies list for API backward compatibility.
        tech_list = [self.technology_type] if self.technology_type else []
        
        # Get IPs and VLANs - use pair fields
        # Access relationships directly (SQLAlchemy will handle lazy loading)
        service_ip = self.service_ip if self.service_ip_id else None
        om_ip = self.om_ip if self.om_ip_id else None
        service_vlan = self.service_vlan if self.service_vlan_id else None
        om_vlan = self.om_vlan if self.om_vlan_id else None
        
        return {
            'id': self.id,
            'site_id': self.site_id,
            'site_name': self.site_name,
            'technology_type': self.technology_type,
            'technologies': tech_list,
            'vendor': self.vendor_obj.name if self.vendor_obj else None,
            'vendor_id': self.vendor_id,
            # Pair fields
            'service_ip_id': self.service_ip_id,
            'service_gateway_ip': service_ip.gateway if service_ip else None,
            'service_subnet_mask': service_ip.subnet_mask if service_ip else None,
            'om_ip_id': self.om_ip_id,
            'om_gateway_ip': om_ip.gateway if om_ip else None,
            'om_subnet_mask': om_ip.subnet_mask if om_ip else None,
            'service_vlan_id': self.service_vlan_id,
            'service_vlan_number': service_vlan.vlan_id if service_vlan else None,
            'om_vlan_id': self.om_vlan_id,
            'om_vlan_number': om_vlan.vlan_id if om_vlan else None,
            'interface_id': self.interface_id,
            'interface_name': self.interface.name if self.interface else None,
            'router_name': self.interface.router.name if self.interface and self.interface.router else None,
            'router_ip': self.interface.router.router_ip if self.interface and self.interface.router else None,
            'router_id': self.interface.router.id if self.interface and self.interface.router else None,
            'assigned_date': self.assigned_date.isoformat() if self.assigned_date else None,
            'created_at': self.created_at.isoformat() if self.created_at else None
        }
    
    def __repr__(self):
        return f'<Site {self.site_name} ({self.site_id})>'

class ActivityLog(db.Model):
    __tablename__ = 'activity_logs'
    
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    user_username = db.Column(db.String(80), nullable=False)
    action = db.Column(db.String(50), nullable=False)  # 'assign_site', 'release_site', 'create_router', 'create_interface', 'create_vlan'
    resource_type = db.Column(db.String(20), nullable=False)  # 'site', 'router', 'interface', 'vlan', 'ip'
    resource_id = db.Column(db.Integer, nullable=False)
    resource_value = db.Column(db.String(200))  # Site name, router name, etc.
    site_name = db.Column(db.String(200))
    router = db.Column(db.String(200))
    interface = db.Column(db.String(200))
    timestamp = db.Column(db.DateTime, default=datetime.utcnow, index=True)
    
    user = db.relationship('User', backref='activity_logs')
    
    def to_dict(self):
        """Convert ActivityLog to dictionary"""
        return {
            'id': self.id,
            'user_username': self.user_username,
            'action': self.action,
            'resource_type': self.resource_type,
            'resource_value': self.resource_value,
            'site_name': self.site_name,
            'router': self.router,
            'interface': self.interface,
            'timestamp': self.timestamp.isoformat() if self.timestamp else None
        }
    
    def __repr__(self):
        return f'<ActivityLog {self.action} by {self.user_username}>'

