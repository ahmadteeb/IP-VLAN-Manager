# IP-VLAN Manager

A comprehensive web-based network management system for managing IP addresses, VLANs, routers, interfaces, sites, vendors, and technologies. Built with Flask and featuring a modern, responsive UI with role-based access control.

## 📋 Table of Contents

- [Features](#features)
- [Screenshots](#screenshots)
- [Prerequisites](#prerequisites)
- [Installation](#installation)
- [Configuration](#configuration)
- [Usage](#usage)
- [Project Structure](#project-structure)
- [API Endpoints](#api-endpoints)
- [User Roles](#user-roles)
- [Services](#services)
- [Contributing](#contributing)
- [License](#license)

## ✨ Features

### Core Functionality
- **IP Address Management**: Track and manage IP addresses with status (free/assigned), vendor associations, and detailed information
- **VLAN Management**: Comprehensive VLAN tracking with site associations and status monitoring
- **Router Management**: Manage routers with vendor information, hostnames, and associations
- **Interface Management**: Track router interfaces with IP and VLAN assignments
- **Site Management**: Manage network sites with bulk import/export capabilities
- **Vendor Management**: Organize equipment by vendor
- **Technology Management**: Track network technologies

### Advanced Features
- **Subnet Calculator**: Built-in subnet calculator for network planning
- **Bulk Operations**: Import/export sites via Excel templates
- **Activity Logging**: Comprehensive audit trail of all user actions
- **Search & Filter**: Advanced search and filtering across all entities
- **Role-Based Access Control**: Admin, Engineer, and Read-only user roles
- **Password Management**: Secure password handling with forced password changes
- **FTP Services**: Automated services for updating routers and sites from external sources
- **Dashboard Statistics**: Real-time statistics and insights

### User Interface
- Modern, responsive design with dark/light theme support
- Glass-morphism UI elements
- Mobile-friendly interface
- Real-time updates and notifications

## 📸 Screenshots

### Dashboard
![Dashboard](screenshots/dashboard.png)
*Main dashboard showing statistics for routers, sites, IPs, and VLANs*

### Site Management
![Site Management](screenshots/site-management.png)
*Site management with bulk import/export functionality*

### Router Management
![Router Management](screenshots/router-management.png)
*Router management interface showing router details and associations*

### Interface Management
![Interface Management](screenshots/interface-management.png)
*Interface management interface showing router interfaces details and associations*

### VLAN Management
![VLAN Management](screenshots/vlan-management.png)
*VLAN management with site associations and status tracking*

### IP Management
![IP Management](screenshots/ip-management.png)
*IP address management interface with search and filtering capabilities*

### User Management
![User Management](screenshots/user-management.png)
*User management interface with role assignment*

## 🔧 Prerequisites

- Python 3.8 or higher
- pip (Python package manager)
- MySQL (optional, SQLite is used by default)

## 📦 Installation

1. **Clone the repository** (or navigate to the project directory):
```bash
cd "IP-VLAN-Manager"
```

2. **Install dependencies**:
```bash
pip install -r requirements.txt
```


3. **Initialize the database**:
The database will be automatically initialized when you first run the application. A default admin user will be created:
- Username: `admin`
- Password: `admin`
- **Note**: You will be required to change the password on first login.

## ⚙️ Configuration

Edit `config.py` to customize the application settings:

```python
class Config:
    HOST = 'localhost'  # Server host
    PORT = 5000          # Server port
    DEBUG = False        # Debug mode
    SECRET_KEY = 'your-secret-key-here'  # Change in production!
    SQLALCHEMY_DATABASE_URI = 'sqlite:///ip_vlan_manager.db'  # Database URI
```

### Environment Variables

See `.env.example` for all app, FTP, and scheduling settings. Docker Compose
loads `.env` automatically; when running Python directly, export the variables
in your shell first.

You can also configure the application using environment variables:
- `HOST`: Server host (default: `localhost`)
- `PORT`: Server port (default: `5000`)
- `DEBUG`: Debug mode (default: `False`)
- `SECRET_KEY`: Secret key for sessions
- `DATABASE_URL`: Database connection string

### Docker Compose

Copy `.env.example` to `.env`, then set a random `SECRET_KEY`, your FTP
credentials, `MYSQL_PASSWORD`, and `MYSQL_ROOT_PASSWORD`. The default
`DATABASE_URL` connects both Python services to the included MySQL container.
Use URL-safe passwords or URL-encode credentials in an explicit `DATABASE_URL`.
MySQL creates the database and application user on first startup; the app
creates tables and the initial admin account after MySQL is healthy.

```powershell
Copy-Item .env.example .env
docker compose up --build -d
docker compose logs -f fetching_services
```

This starts three containers: MySQL, the app at `http://localhost:5000` (or
your `PORT`), and the fetching scheduler. The scheduler waits for the app to be healthy,
then runs download, router update, site update, and duplicated-IP check in order. A failed step
stops that cycle; the scheduler retries at the next daily start time.

Set `FETCH_START_TIME` to the daily start time in 24-hour `HH:MM` format
(default `02:00`) and `TZ` to an IANA timezone (default `Asia/Amman`). The
scheduler waits until the next scheduled time, including after a restart.
Runs never overlap; if a run spans the next start time, that start is skipped.
Recreate containers with `docker compose up -d --build` after changing `.env`.

Reports and service log files persist in the `fetching-data` volume at `/data`.
All containers join the bridge network `172.30.10.0/24`, with fixed addresses
`172.30.10.2` (app), `172.30.10.3` (fetcher), and `172.30.10.4` (MySQL).
Edit `compose.yaml` to change these addresses. Avoid overlaps with your LAN,
VPN, or other Docker networks. These are Docker network addresses; access the
app through the published host port as above. After changing an existing
network's subnet, run `docker compose down` then `docker compose up -d --build`
to recreate the network; named data volumes are preserved.

MySQL data persists in the `mysql-data` volume and its port is available only
inside the Docker network. `MYSQL_*` initialization settings apply only to an
empty data volume; changing passwords in `.env` does not change existing
database users. The app's instance directory also persists in a volume. For
app-only local usage, `DATABASE_URL=sqlite:///ip_vlan_manager.db` is supported,
but the fetching pipeline requires MySQL.

## 🚀 Usage

### Running the Application

**Development Mode**:
```bash
python app.py
```

The application will be available at `http://localhost:5000`

**Production Mode**:
The application uses Waitress WSGI server for production. Set `DEBUG = False` in `config.py` and run:
```bash
python app.py
```

### Vendor VLAN allocation

On the Vendors page, select **Per interface** or **Per router** for each vendor.
In Role Management, grant **Update Vendor Settings** (`vendors.update`) to
allow changes to existing vendors; it requires **View Vendors**. **Add Vendors**
still controls creation, including the initial allocation choice. The Admin
role automatically receives the new permission on startup. Per interface allows a VLAN number to be reused on another
interface; per router requires a VLAN number to be unused across all interfaces
of the destination router. Other routers can still reuse it. Service and OM
VLANs are both checked, including records sharing the same VLAN number.
The setting applies to site creation, Excel import, VLAN availability, editing,
and transfers. Existing sites retain their allocations when the setting changes.
Startup adds the setting to existing databases with **Per interface** as the
default. Rebuild/restart the app to apply the schema change.

### Running Services

The **Duplicated IPs** page (`/duplicated-ip`) shows the latest successful
inventory scan to users with **View Duplicated IPs** (`duplicated_ips.view`)
permission, available in Role Management under Duplicated IPs. This is separate
from View IPs; non-admin roles must be granted it explicitly. An IPv4 address is flagged
when it appears on two or more distinct router/interface pairs and matches a
`gateway` in the IP table with a nonempty technology (`ips.type`). Technology
comes from that database record; no VPN field is needed in the report. IPs
absent from the IP table are excluded. Results store router IDs; the page resolves current router
names and IPs from the routers table and displays one occurrence per row.
Inventory routers absent from the routers table are logged and skipped.
Router and site updates complete before the duplicate check runs.
The `duplicate_IPs` table stores one row per duplicate router/interface
occurrence, with columns `id`, `ip_id`, `router_id`, `interface_id`, and
`checked_at`. IP address and technology, router details, and interface names
are read from their related records. Report interface aliases are matched to
existing interfaces on the same router, falling back to the parent interface
for subinterfaces. Missing or ambiguous matches are logged and skipped.
Results are replaced in one transaction; failed checks retain existing
rows. An empty successful scan clears the table, so no timestamp is displayed
when there are no duplicates.
Repeated rows for the same interface, empty addresses, `NoIP`, `--`, and
`0.0.0.0` are ignored. This reports inventory duplicates, including intentional
shared addresses; it does not probe the live network. The scan runs after each
scheduled download using `FETCH_START_TIME` and `TZ`, and stores its results
and UTC check time in MySQL. Failed scans preserve the previous results.
Rebuild/restart the app to create `duplicate_IPs` before running the updated
scheduler. Startup removes the obsolete `duplicate_ip_scans` JSON table;
it also recreates the old string-based `duplicate_IPs` table with ID columns.
Cached results are discarded and regenerated by the next check; source IP,
router, and interface records are preserved.

The application includes background services for updating routers and sites:

Reports are validated before database writes. Router imports refresh names,
addresses, and types and add missing routers/interfaces. Database routers with
neither a matching name nor address in the complete network-element export
are deleted, along with their interfaces and duplicate-IP rows. Related sites
are preserved with `interface_id=NULL`, which also leaves their router
unassigned. Their IP/VLAN assignments and IP allocation status are retained.
Treat the export as authoritative: a nonempty but incomplete report can remove
valid routers and detach sites. Empty or malformed reports fail before deletion.
Conflicting router identities are logged with database IDs and
skipped without merging or deleting records; duplicate scans also skip router
IPs matching multiple database records. Interface skips are summarized by
reason. Each import uses a transaction so database failures roll back its
changes. Site imports refresh service/OM IP IDs, service/OM VLAN IDs, and
interface ID for each matched site. Matching currently uses the site's existing
service/OM gateway addresses through the site's existing IP IDs. Service IPs
must match; OM is optional. If an existing OM IP is absent from the inventory,
its assignments are preserved while service fields refresh. VLAN numbers
resolve to `vlans.id`; no matching VLAN record leaves the VLAN ID null.
Discovering changed or missing service IPs requires a site identifier in the
report. Imports skip missing required or ambiguous IP/interface/VLAN matches and
log the reason; optional OM IPs may be null. VLAN matching respects the site's
vendor and keeps a matching existing assignment when VLAN numbers are reused.
Run summaries and failures appear in container output, with completion/error
logs appended to the service working directory.

**Update Routers Service**:
```bash
cd fetching_services
python update_routers.py
```

**Update Sites Service**:
```bash
cd fetching_services
python update_sites.py
```

Or use the batch files:
```bash
fetching_services\run_service.bat
```

## 📁 Project Structure

```
IP-VLAN Manager/
├── app.py                      # Main Flask application
├── config.py                   # Configuration settings
├── requirements.txt            # Python dependencies
├── models/
│   └── models.py              # Database models
├── templates/                  # HTML templates
│   ├── base.html
│   ├── dashboard.html
│   ├── login.html
│   ├── routers.html
│   ├── ips.html
│   ├── vlans.html
│   ├── sites.html
│   ├── interfaces.html
│   ├── users.html
│   ├── vendors.html
│   ├── technologies.html
│   └── subnet_calculator.html
├── static/
│   ├── css/
│   │   └── style.css          # Main stylesheet
│   └── js/                    # JavaScript files
│       ├── app.js
│       ├── routers.js
│       ├── ips.js
│       ├── vlans.js
│       ├── sites.js
│       ├── interfaces.js
│       ├── users.js
│       ├── vendors.js
│       ├── technologies.js
│       └── subnet_calculator.js
├── fetching_services/          # Background services
│   ├── update_routers.py
│   ├── update_sites.py
│   ├── ftp_client.py
│   └── download_files.py
├── helping_scripts/            # Utility scripts
│   └── sites_ips_check.py
├── screenshots/                # Application screenshots
└── instance/                   # Database instance (created at runtime)
    └── ip_vlan_manager.db
```

## 🔌 API Endpoints

### Authentication
- `GET /login` - Login page
- `POST /login` - Authenticate user
- `GET /logout` - Logout user
- `GET /change-password` - Change password page
- `POST /change-password` - Update password

### Dashboard
- `GET /` - Redirect to dashboard
- `GET /dashboard` - Main dashboard

### Routers
- `GET /routers` - Routers page
- `GET /api/routers` - Get all routers
- `POST /api/routers` - Create router
- `PUT /api/routers/<id>` - Update router
- `DELETE /api/routers/<id>` - Delete router

### IP Addresses
- `GET /ips` - IPs page
- `GET /api/ips` - Get all IPs
- `GET /api/ips/available` - Get available IPs
- `POST /api/ips` - Create IP
- `DELETE /api/ips/<id>` - Delete IP
- `POST /api/ips/bulk-delete` - Bulk delete IPs

### VLANs
- `GET /vlans` - VLANs page
- `GET /api/vlans` - Get all VLANs
- `POST /api/vlans` - Create VLAN
- `DELETE /api/vlans/<id>` - Delete VLAN

### Sites
- `GET /sites` - Sites page
- `GET /api/sites` - Get all sites
- `POST /api/sites` - Create site
- `POST /api/sites/bulk-import` - Bulk import sites
- `GET /api/sites/template/download` - Download import template
- `GET /api/export/sites` - Export sites
- `POST /api/sites/<id>/release` - Release site
- `POST /api/sites/release` - Bulk release sites
- `POST /api/sites/transfer/check` - Check site transfer
- `POST /api/sites/transfer` - Transfer site

### Interfaces
- `GET /interfaces` - Interfaces page
- `GET /api/interfaces` - Get all interfaces
- `POST /api/interfaces` - Create interface
- `DELETE /api/interfaces/<id>` - Delete interface

### Users
- `GET /users` - Users page (Admin only)
- `GET /api/users` - Get all users
- `POST /api/users` - Create user
- `PUT /api/users/<id>` - Update user
- `DELETE /api/users/<id>` - Delete user
- `PUT /api/users/<id>/reset-password` - Reset user password

### Vendors
- `GET /vendors` - Vendors page
- `GET /api/vendors` - Get all vendors
- `POST /api/vendors` - Create vendor
- `PUT /api/vendors/<id>` - Update vendor
- `DELETE /api/vendors/<id>` - Delete vendor

### Technologies
- `GET /technologies` - Technologies page
- `GET /api/technologies` - Get all technologies
- `POST /api/technologies` - Create technology
- `PUT /api/technologies/<id>` - Update technology
- `DELETE /api/technologies/<id>` - Delete technology

### Utilities
- `GET /subnet-calculator` - Subnet calculator page
- `POST /api/subnet-calculator` - Calculate subnet
- `GET /api/stats` - Get dashboard statistics
- `GET /api/activity-logs` - Get activity logs

## 👥 User Roles

### Admin
- Full access to all features
- User management (create, edit, delete users)
- Can reset user passwords
- Access to all data and operations

### Engineer
- Can create, edit, and delete network entities (IPs, VLANs, routers, sites, etc.)
- Cannot manage users
- Full read and write access to network data

### Read-Only
- View-only access to all data
- Cannot create, edit, or delete any entities
- Ideal for monitoring and reporting purposes

## 🔄 Services

### Update Routers Service
Automated service that fetches router data from external sources (FTP) and updates the database.

**Location**: `fetching_services/update_routers.py`

**Features**:
- FTP client integration
- Automatic router updates
- Logging of successful updates

### Update Sites Service
Automated service that fetches site data from external sources and updates the database.

**Location**: `fetching_services/update_sites.py`

**Features**:
- FTP client integration
- Automatic site updates
- Logging of successful updates

## 🛠️ Development

### Database Models

The application uses SQLAlchemy ORM with the following main models:
- `User` - User accounts with role-based access
- `IP` - IP address records
- `VLAN` - VLAN records
- `Router` - Router information
- `Interface` - Router interfaces
- `Site` - Network sites
- `Vendor` - Equipment vendors
- `Technology` - Network technologies
- `ActivityLog` - Audit trail
- `PasswordState` - Password management

### Adding New Features

1. Add database models in `models/models.py`
2. Create routes in `app.py`
3. Add templates in `templates/`
4. Add JavaScript handlers in `static/js/`
5. Update CSS in `static/css/style.css` if needed

## 📝 Logging

The application includes comprehensive logging:
- Activity logs for all user actions
- Service logs for background operations
- Error logging with exception details

Logs are stored in:
- `fetching_services/success_update_routers.log`
- `fetching_services/success_update_sites.log`

## 🔒 Security

- Password hashing using Werkzeug
- Session management with Flask-Login
- Role-based access control
- Forced password changes for new users
- CSRF protection (via Flask-WTF if configured)
- SQL injection protection (via SQLAlchemy ORM)

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## 📄 License

This project is proprietary software. All rights reserved.
---

**Note**: Remember to change the default admin password and secret key before deploying to production!

