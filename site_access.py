"""Apply role vendor visibility to user-facing site queries."""
from flask import has_request_context
from flask_login import current_user

from models.models import Site, Vendor


def allowed_site_vendor_ids():
    if not has_request_context():
        return None
    if not current_user.is_authenticated or not current_user.role_obj:
        return []
    return current_user.role_obj.site_vendor_ids


def visible_sites():
    ids = allowed_site_vendor_ids()
    return Site.query if ids is None else Site.query.filter(Site.vendor_id.in_(ids))


def visible_site_vendors():
    ids = allowed_site_vendor_ids()
    return Vendor.query if ids is None else Vendor.query.filter(Vendor.id.in_(ids))


def site_is_visible(site):
    ids = allowed_site_vendor_ids()
    return ids is None or site.vendor_id in ids


def validate_site_vendor_ids(value):
    if value is None:
        return None
    if not isinstance(value, list) or any(type(identifier) is not int for identifier in value):
        raise ValueError('Site vendors must be a list of vendor IDs or null for all vendors.')
    ids = list(dict.fromkeys(value))
    if Vendor.query.filter(Vendor.id.in_(ids)).count() != len(ids):
        raise ValueError('One or more site vendor IDs are invalid.')
    return ids
