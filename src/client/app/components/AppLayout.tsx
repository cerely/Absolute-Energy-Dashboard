/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import * as React from 'react';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { Slide, ToastContainer } from 'react-toastify';
import { useAppSelector } from '../redux/reduxHooks';
import { selectIsLoggedIn } from '../redux/slices/currentUserSlice';
import 'react-toastify/dist/ReactToastify.css';
// import FooterComponent from './FooterComponent';
// import HeaderComponent from './HeaderComponent';
import Sidebar from './sidebar';
import Nav from './Nav';

interface LayoutProps {
	children?: React.ReactNode | undefined
}
/**
 * @param props Optional Children prop to render instead of using Outlet
 * @returns The OED Application Layout. The current route as the outlet Wrapped in the header, and footer components
 */
export default function AppLayout(props: LayoutProps) {
	// const location = useLocation();
	// const isDashboard = location.pathname === '/';
	const theme = useAppSelector(state => state.appState.theme);
	const collapsed = useAppSelector(state => state.appState.sidebarCollapsed);
	const isLoggedIn = useAppSelector(selectIsLoggedIn);
	const navigate = useNavigate();
	const location = useLocation();

	React.useEffect(() => {
		if (!isLoggedIn) {
			navigate('/login', { state: { from: location } });
		}
	}, [isLoggedIn, navigate, location]);

	React.useEffect(() => {
		if (theme === 'dark') {
			document.body.classList.add('dark-mode');
		} else {
			document.body.classList.remove('dark-mode');
		}
	}, [theme]);

	const sidebarWidth = collapsed ? '70px' : '200px';
	const contentMargin = collapsed ? '82px' : '220px'; // sidebar width + gaps

	return (
		<>
			<ToastContainer transition={Slide} />
			<div style={{ display: 'flex', width: '100%', height: '100vh', padding: '10px' }}>
				{/* Main Navigation Sidebar */}
				<div style={{ flexShrink: 0 }}>
					<Sidebar />
				</div>

				{/* Main Content Area */}
				<div style={{ 
					flexGrow: 1, 
					display: 'flex', 
					flexDirection: 'column', 
					marginLeft: contentMargin, 
					width: `calc(100% - ${collapsed ? '110px' : '260px'})`,
					transition: 'all 0.3s ease'
				}}>
					<div style={{
						display: 'flex',
						flexDirection: 'column',
						flexGrow: 1,
						overflowY: 'auto',
						overflowX: 'hidden',
						height: '100%'
					}}>
						<Nav style={{ marginBottom: '16px' }} />
						{
							// For the vast majority of cases we utilize react-router's outlet here.
							// However we can use app layout with children.
							// Refer to ErrorComponent.tsx for children usage.
							// Refer to RouteComponent for outlet usage
							props.children ?? <Outlet />
						}
					</div>
				</div>
			</div>
		</>
	);
}