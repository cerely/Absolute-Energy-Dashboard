import { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Modal, ModalBody, ModalHeader } from 'reactstrap';
import { authApi } from '../redux/api/authApi';
import { useAppDispatch, useAppSelector } from '../redux/reduxHooks';
import { selectCurrentUserProfile, selectHasRolePermissions, selectIsAdmin, selectIsLoggedIn } from '../redux/slices/currentUserSlice';
import { appStateSlice } from '../redux/slices/appStateSlice';
import { UserRole } from '../types/items';
import pfp from './assets/pfp.jpg';
import absLogoFallback from './assets/abs-logo.png';
import './dashboard.css';
import { useNavigate } from 'react-router-dom';

export default function Sidebar() {
	const location = useLocation();
	const [logout] = authApi.useLogoutMutation();
	const isAdmin = useAppSelector(selectIsAdmin);
	const isLoggedIn = useAppSelector(selectIsLoggedIn);
	const userProfile = useAppSelector(selectCurrentUserProfile);
	const csvPermission = useAppSelector(state => selectHasRolePermissions(state, UserRole.CSV));
	const collapsed = useAppSelector(state => state.appState.sidebarCollapsed);
	const dispatch = useAppDispatch();
	const navigate = useNavigate();

	const [logoSrc, setLogoSrc] = useState<string>(absLogoFallback);

	// Fetch custom logo from database on mount
	useEffect(() => {
		fetch('/api/dashboard/get-logo')
			.then(r => r.json())
			.then(data => {
				if (data.logoUrl) {
					setLogoSrc(data.logoUrl);
				}
			})
			.catch(() => { /* use fallback */ });
	}, []);

	const isActive = (path: string) => location.pathname === path ? 'active-nav' : '';

	const handleLogout = (e: React.MouseEvent) => {
		e.preventDefault();
		logout();
	};

	return (
		<div className={`sidebar ${collapsed ? 'collapsed' : ''}`}>
			
			{/* Brand Logo Section */}
			<div style={{ padding: collapsed ? '0px 8px 16px' : '0px 12px 16px', display: 'flex', alignItems: 'center', justifyContent: 'center', borderBottom: '1px solid var(--sidebar-border, rgba(255,255,255,0.05))', marginBottom: '16px' }}>
				{!collapsed ? (
					<div style={{padding: '2px 12px', borderRadius: '8px', display: 'flex', justifyContent: 'center', width: '100%' }}>
						<img src={logoSrc} alt="Site Logo" style={{ width: '100%', maxWidth: '180px', height: 'auto', objectFit: 'contain' }} />
					</div>
				) : (
					<div style={{ width: '36px', height: '36px', borderRadius: '4px', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '4px', overflow: 'hidden' }}>
						<img src={logoSrc} alt="Logo" style={{ width: 'auto', height: '100%', objectFit: 'cover', objectPosition: 'left center' }} />
					</div>
				)}
			</div>
			<div className="profile">
				<div className="profile-main-info">
					<div className="profile-pic">
						<img src={userProfile?.image || pfp} alt="" />
					</div>

					{!collapsed && (
						<div className="profile-info">
							<h3>{userProfile?.username || 'Guest'}</h3>
							<p>{isAdmin ? 'Administrator' : 'Viewer'}</p>
						</div>
					)}
				</div>

				{/* ✅ Toggle Button now inside profile */}
				<div className="collapse-btn" onClick={() => dispatch(appStateSlice.actions.toggleSidebar())}>
					<span className="material-symbols-rounded">
						{collapsed ? 'chevron_right' : 'chevron_left'}
					</span>
				</div>
			</div>

			<div className="nav-items" style={{ overflowY: 'auto', flex: 1 }}>
				
				<div className="nav-section-label">MENU</div>

				<Link to="/" className={`nav-item ${isActive('/')}`} title="Dashboard">
					<span className="material-symbols-rounded">dashboard</span>
					{!collapsed && <span>Dashboard</span>}
				</Link>

				<Link to="/charts" className={`nav-item ${isActive('/charts')}`} title="Graphs">
					<span className="material-symbols-rounded">bar_chart</span>
					{!collapsed && <span>Graphs</span>}
				</Link>

				<Link to="/groups" className={`nav-item ${isActive('/groups')}`} title="Groups">
					<span className="material-symbols-rounded">account_tree</span>
					{!collapsed && <span>Groups</span>}
				</Link>

				<Link to="/meters" className={`nav-item ${isActive('/meters')}`} title="Meters">
					<span className="material-symbols-rounded">electric_meter</span>
					{!collapsed && <span>Meters</span>}
				</Link>

				{isAdmin && (
					<>
						<div className="nav-section-label" style={{ marginTop: '16px' }}>ADMIN</div>

						<Link to="/maps" className={`nav-item ${isActive('/maps')}`} title="Maps">
							<span className="material-symbols-rounded">map</span>
							{!collapsed && <span>Maps</span>}
						</Link>

						<Link to="/users" className={`nav-item ${isActive('/users')}`} title="Users">
							<span className="material-symbols-rounded">group</span>
							{!collapsed && <span>Users</span>}
						</Link>

						<Link to="/units" className={`nav-item ${isActive('/units')}`} title="Units">
							<span className="material-symbols-rounded">straighten</span>
							{!collapsed && <span>Units</span>}
						</Link>

						<Link to="/conversions" className={`nav-item ${isActive('/conversions')}`} title="Conversions">
							<span className="material-symbols-rounded">transform</span>
							{!collapsed && <span>Conversions</span>}
						</Link>

						<Link to="/logmsg" className={`nav-item ${isActive('/logmsg')}`} title="Logs">
							<span className="material-symbols-rounded">list_alt</span>
							{!collapsed && <span>Logs</span>}
						</Link>

						<Link to="/visual-unit" className={`nav-item ${isActive('/visual-unit')}`} title="Visual Unit">
							<span className="material-symbols-rounded">view_in_ar</span>
							{!collapsed && <span>Visual Unit</span>}
						</Link>

						<Link to="/reports" className={`nav-item ${isActive('/reports')}`} title="Reports">
							<span className="material-symbols-rounded">summarize</span>
							{!collapsed && <span>Reports</span>}
						</Link>

						<Link to="/report-log" className={`nav-item ${isActive('/report-log')}`} title="Report Log">
							<span className="material-symbols-rounded">history</span>
							{!collapsed && <span>Report Log</span>}
						</Link>

						<Link to="/mqtt" className={`nav-item ${isActive('/mqtt')}`} title="MQTT Config">
							<span className="material-symbols-rounded">router</span>
							{!collapsed && <span>MQTT Config</span>}
						</Link>

						<div className="nav-section-label" style={{ marginTop: '16px' }}>DATA</div>

						<Link to="/csvMeters" className={`nav-item ${isActive('/csvMeters')}`} title="Upload Meters">
							<span className="material-symbols-rounded">upload_file</span>
							{!collapsed && <span>Upload Meters</span>}
						</Link>
					</>
				)}

				{(csvPermission || isAdmin) && (
					<Link to="/csvReadings" className={`nav-item ${isActive('/csvReadings')}`} title="Upload Data">
						<span className="material-symbols-rounded">upload_2</span>
						{!collapsed && <span>Upload Data</span>}
					</Link>
				)}
			</div>

			<div className="sidebar-footer-simple">
				<Link to="/admin" className="footer-item-simple" title="Settings">
					<span className="material-symbols-rounded">settings</span>
					{!collapsed && <span>Settings</span>}
				</Link>

				{isLoggedIn ? (
					<div className="footer-item-simple" onClick={handleLogout} style={{ cursor: 'pointer' }} title="Logout">
						<span className="material-symbols-rounded">logout</span>
						{!collapsed && <span>Logout</span>}
					</div>
				) : (
					<div className="footer-item-simple" onClick={() => navigate('/login')} style={{ cursor: 'pointer' }} title="Login">
						<span className="material-symbols-rounded">login</span>
						{!collapsed && <span>Login</span>}
					</div>
				)}
			</div>
		</div>
	);
}