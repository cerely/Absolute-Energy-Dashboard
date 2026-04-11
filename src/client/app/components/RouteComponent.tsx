/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
import * as React from 'react';
import { IntlProvider } from 'react-intl';
import { RouterProvider, createBrowserRouter } from 'react-router-dom';
import ReadingsCSVUploadComponent from '../components/csv/ReadingsCSVUploadComponent';
import MetersCSVUploadComponent from '../components/csv/MetersCSVUploadComponent';
import MapCalibrationContainer from '../containers/maps/MapCalibrationContainer';
import MapsDetailContainer from '../containers/maps/MapsDetailContainer';
import { useAppSelector } from '../redux/reduxHooks';
import LocaleTranslationData from '../translations/data';
import { UserRole } from '../types/items';
import AppLayout from './AppLayout';
import HomeComponent from './HomeComponent';
import AdminComponent from './admin/AdminComponent';
import UsersDetailComponent from './admin/users/UsersDetailComponent';
import ConversionsDetailComponent from './conversion/ConversionsDetailComponent';
import GroupsDetailComponent from './groups/GroupsDetailComponent';
import MetersDetailComponent from './meters/MetersDetailComponent';
import AdminOutlet from './router/AdminOutlet';
import { GraphLink } from './router/GraphLinkComponent';
import NotFound from './router/NotFoundOutlet';
import RoleOutlet from './router/RoleOutlet';
import UnitsDetailComponent from './unit/UnitsDetailComponent';
import ErrorComponent from './router/ErrorComponent';
import { selectSelectedLanguage } from '../redux/slices/appStateSlice';
import LogMsgComponent from './admin/LogMsgComponent';
import VisualUnitDetailComponent from './visual-unit/VisualUnitDetailComponent';
import SimpleLinePage from './SimpleLinePage';
import MainDashboard from './MainDashboard';
import MDashDisplay from './MDashDisplay';
import StatsDashboard from './StatsDashboard';
import ReportsPage from './admin/reports/ReportsPage';
import ReportLogPage from './admin/reports/ReportLogPage';
import MqttComponent from './admin/mqtt/MqttComponent';
import AuthPage from './auth/AuthPage';

/**
 * @returns the router component Responsible for client side routing.
 */
export default function RouteComponent() {
	const lang = useAppSelector(selectSelectedLanguage);
	const messages = (LocaleTranslationData)[lang];
	return (
		<IntlProvider locale={lang} messages={messages} key={lang}>
			<RouterProvider router={router} />
		</IntlProvider>
	);
}

// Router Responsible for client side routing.
const router = createBrowserRouter([
	{ path: '/login', element: <AuthPage mode="login" /> },
	{ path: '/signup', element: <AuthPage mode="signup" /> },
	{ path: '/simple-line-only', element: <SimpleLinePage /> },
	{ path: '/main-dashboard-front', element: <MainDashboard /> },
	{ path: '/mdash-display', element: <MDashDisplay /> },
	{
		// TODO Error Component needs to be implemented, Its currently a bare bones placeholder
		path: '/', element: <AppLayout />, errorElement: <ErrorComponent />,
		children: [
			{ index: true, element: <StatsDashboard /> },
			{ path: 'charts', element: <HomeComponent /> },
			{ path: 'groups', element: <GroupsDetailComponent /> },
			{ path: 'meters', element: <MetersDetailComponent /> },
			{ path: 'graph', element: <GraphLink /> },
			{
				element: <AdminOutlet />,
				children: [
					{ path: 'admin', element: <AdminComponent /> },
					{ path: 'calibration', element: <MapCalibrationContainer /> },
					{ path: 'conversions', element: <ConversionsDetailComponent /> },
					{ path: 'csvMeters', element: <MetersCSVUploadComponent /> },
					{ path: 'maps', element: <MapsDetailContainer /> },
					{ path: 'units', element: <UnitsDetailComponent /> },
					{ path: 'users', element: <UsersDetailComponent /> },
					{ path: 'logmsg', element: <LogMsgComponent /> },
					{ path: 'visual-unit', element: <VisualUnitDetailComponent /> },
					{ path: 'reports', element: <ReportsPage /> },
					{ path: 'report-log', element: <ReportLogPage /> },
					{ path: 'mqtt', element: <MqttComponent /> }
				]
			},
			{
				element: <RoleOutlet role={UserRole.CSV} />,
				children: [
					{ path: 'csvReadings', element: <ReadingsCSVUploadComponent /> }
				]
			},
			{ path: '*', element: <NotFound /> }
		]
	}
]);
