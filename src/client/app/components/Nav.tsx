import React, { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useAppDispatch, useAppSelector } from '../redux/reduxHooks';
import { selectDisplayTitle } from '../redux/slices/adminSlice';
import { selectTheme, toggleTheme, selectSelectedDeviceId } from '../redux/slices/appStateSlice';
import './dashboard.css';
import LogoComponent from './LogoComponent';
import { useDashboardSettings } from '../hooks/useDashboardSettings';

// eslint-disable-next-line jsdoc/require-param-description
export default function Nav({ style }: { style?: React.CSSProperties }) {
	const dispatch = useAppDispatch();
	const location = useLocation();
	const [currentDate, setCurrentDate] = useState('');
	const [notificationOpen, setNotificationOpen] = useState(false);
	const siteTitle = useAppSelector(selectDisplayTitle);
	const theme = useAppSelector(selectTheme);
	const selectedDeviceId = useAppSelector(selectSelectedDeviceId);
	const { settings } = useDashboardSettings();

	// Get the selected device label for the header
	const getSelectedDeviceLabel = (): string => {
		if (settings.customDashboardDevices && settings.customDashboardDevices.length > 0) {
			const dev = settings.customDashboardDevices.find(d => d.id === selectedDeviceId);
			if (dev) return dev.label || dev.name || 'N/A';
			
			// Default to first device if none selected or not found (matching dashboard fallback)
			const first = settings.customDashboardDevices[0];
			return first.label || first.name || 'N/A';
		}
		
		// Fallback for non-custom devices (where selectedDeviceId is the direct device name)
		return selectedDeviceId || 'N/A';
	};

	const getPageTitle = () => {
		const path = location.pathname;
		if (path === '/' || path === '/charts') return siteTitle || 'Dashboard';
		if (path === '/admin') return 'Admin Settings';
		if (path.startsWith('/reports')) return 'Reports';
		if (path.startsWith('/report-log')) return 'Report Logs';
		if (path.startsWith('/users')) return 'Users';
		if (path.startsWith('/groups')) return 'Groups';
		if (path.startsWith('/meters')) return 'Meters';
		if (path.startsWith('/maps')) return 'Maps';
		if (path.startsWith('/conversions')) return 'Conversions';
		if (path.startsWith('/calibration')) return 'Map Calibration';
		if (path.startsWith('/csvMeters')) return 'CSV Meters';
		if (path.startsWith('/csvReadings')) return 'CSV Readings';
		if (path.startsWith('/units')) return 'Units';
		if (path.startsWith('/visual-unit')) return 'Visual Graphic';
		if (path.startsWith('/logmsg')) return 'System Logs';
		if (path.startsWith('/mqtt')) return 'MQTT Configuration';
		
		return siteTitle || 'Dashboard';
	};

	useEffect(() => {
		const updateDate = () => {
			const date = new Date();
			const options: Intl.DateTimeFormatOptions = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
			setCurrentDate(date.toLocaleDateString(undefined, options));
		};
		updateDate();
		const timer = setInterval(updateDate, 60000);
		return () => clearInterval(timer);
	}, []);

	const handleThemeToggle = () => {
		dispatch(toggleTheme());
	};

	return (
		<div style={{ ...style, display: 'flex', flexDirection: 'column', gap: '20px', width: '100%' }}>
			{/* Top Header Box */}
			<div className="dashboard-header" style={{ width: '100%', margin: 0, border: theme === 'dark' ? '1px solid #30363d' : '1px solid #E5E7EB', borderRadius: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
				<div className="nav-left" style={{ display: 'flex', alignItems: 'center', gap: 0 }}>
					<LogoComponent height={40} url='/Vyom 5.0 logo art.png' />
					<div className="nav-greetings" style={{ flexDirection: 'column', marginBottom: 0, justifyContent: 'center' }}>
						<h2 style={{ fontSize: '16px', fontWeight: 'bold', color: theme === 'dark' ? '#1C90B3' : '#2B3674', margin: 0 }}>Energy Dashboard</h2>
						<h1 style={{ fontSize: '14px', color: theme === 'dark' ? '#8b949e' : '#1F2937', margin: 0, fontWeight: 500, paddingLeft: '2px' }}>-by Absolute Motion</h1>
					</div>
				</div>
				<div className="nav-right" style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
					<button className="theme-mode" style={{ cursor: 'pointer', border: theme === 'dark' ? '1px solid #30363d' : '1px solid #E5E7EB', background: 'transparent' }} onClick={handleThemeToggle}>
						<span className="material-symbols-rounded" style={{ fontSize: '20px' }}>
							{theme === 'light' ? 'sunny' : 'dark_mode'}
						</span>
						<span>{theme === 'light' ? 'Light Mode' : 'Dark Mode'}</span>
					</button>
					<button className="notification" style={{ cursor: 'pointer', border: theme === 'dark' ? '1px solid #30363d' : '1px solid #E5E7EB', background: 'transparent' }} onClick={() => setNotificationOpen(true)}>
						<span className="material-symbols-rounded">notifications</span>
					</button>
				</div>
			</div>

			{/* Sub-Header Row */}
			<div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', width: '100%', padding: '26px 8px 20px' }}>
				<div className="nav-greetings" style={{ flexDirection: 'column', marginBottom: 0 }}>
					<h2 style={{ fontSize: '26px', fontWeight: '700', color: theme === 'dark' ? '#00F2EA' : '#2B3674', margin: 0, lineHeight: 1.2 }}>{getPageTitle()}</h2>
					<h1 style={{ fontSize: '16px', color: theme === 'dark' ? '#D1D5DB' : '#6B7280', margin: 0, marginTop: '4px', fontWeight: 400 }}>{currentDate}</h1>
				</div>
				{(location.pathname === '/') && getSelectedDeviceLabel() && (
					<div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: '2px' }}>
						<span style={{ fontSize: '30px', fontWeight: '700', color: theme === 'dark' ? '#ffffff' : '#2B3674', letterSpacing: '-0.3px' }}>
							{getSelectedDeviceLabel()}
						</span>
					</div>
				)}
				<div style={{ fontSize: '24px', fontWeight: '700', color: theme === 'dark' ? '#D1D5DB' : '#2B3674', marginBottom: '8px' }}>
					Industry 4.0
				</div>
			</div>

			{/* Notification Side Menu Overlays */}
			{notificationOpen && (
				<div 
					style={{
						position: 'fixed',
						top: 0,
						left: 0,
						width: '100vw',
						height: '100vh',
						background: 'rgba(0,0,0,0.3)',
						zIndex: 9998,
						transition: 'opacity 0.3s ease'
					}}
					onClick={() => setNotificationOpen(false)}
				/>
			)}
			<div 
				style={{
					position: 'fixed',
					top: 0,
					right: notificationOpen ? 0 : '-400px',
					width: '350px',
					height: '100vh',
					backgroundColor: 'var(--card-bg, #ffffff)',
					boxShadow: '-4px 0 24px rgba(0,0,0,0.1)',
					transition: 'right 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
					zIndex: 9999,
					padding: '24px',
					display: 'flex',
					flexDirection: 'column'
				}}
			>
				<div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', paddingBottom: '16px', borderBottom: '1px solid var(--divider-color, #e5e7eb)' }}>
					<h3 style={{ margin: 0, fontSize: '18px', fontWeight: '600', color: 'var(--text-value, #111827)' }}>Notifications</h3>
					<span className="material-symbols-rounded" style={{ cursor: 'pointer', color: 'var(--text-label, #6b7280)', padding: '4px', borderRadius: '50%' }} onClick={() => setNotificationOpen(false)}>close</span>
				</div>
				
				<div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '16px' }}>
					{/* Example Notifications */}
					<div style={{ padding: '10px', borderRadius: '12px', background: 'var(--card-border, #f9fafb)', border: '1px solid var(--divider-color, #e5e7eb)' }}>
						<div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
							<span className="material-symbols-rounded" style={{ color: '#3b5bfe', fontSize: '20px' }}>login</span>
							<p style={{ margin: 0, fontSize: '14px', fontWeight: 'bold', color: 'var(--text-value, #111827)' }}>Admin Login</p>
						</div>
						<p style={{ margin: '0 0 8px 0', fontSize: '13px', color: 'var(--text-label, #4b5563)', lineHeight: '1.4' }}>Admin user successfully logged into the system.</p>
						<span style={{ fontSize: '11px', color: 'var(--text-label, #9ca3af)' }}>Just now</span>
					</div>

					<div style={{ padding: '10px', borderRadius: '12px', background: 'var(--card-border, #f9fafb)', border: '1px solid var(--divider-color, #e5e7eb)' }}>
						<div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
							<span className="material-symbols-rounded" style={{ color: '#10b981', fontSize: '20px' }}>settings</span>
							<p style={{ margin: 0, fontSize: '14px', fontWeight: 'bold', color: 'var(--text-value, #111827)' }}>Settings Updated</p>
						</div>
						<p style={{ margin: '0 0 8px 0', fontSize: '13px', color: 'var(--text-label, #4b5563)', lineHeight: '1.4' }}>Tariff rate configuration changes were saved.</p>
						<span style={{ fontSize: '11px', color: 'var(--text-label, #9ca3af)' }}>2 hours ago</span>
					</div>
					
					<div style={{ padding: '10px', borderRadius: '12px', background: 'var(--card-border, #f9fafb)', border: '1px solid var(--divider-color, #e5e7eb)' }}>
						<div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
							<span className="material-symbols-rounded" style={{ color: '#f59e0b', fontSize: '20px' }}>device_hub</span>
							<p style={{ margin: 0, fontSize: '14px', fontWeight: 'bold', color: 'var(--text-value, #111827)' }}>MQTT Reconnected</p>
						</div>
						<p style={{ margin: '0 0 8px 0', fontSize: '13px', color: 'var(--text-label, #4b5563)', lineHeight: '1.4' }}>MQTT Broker connection established successfully.</p>
						<span style={{ fontSize: '11px', color: 'var(--text-label, #9ca3af)' }}>Yesterday</span>
					</div>
				</div>
			</div>
		</div>
	);
}