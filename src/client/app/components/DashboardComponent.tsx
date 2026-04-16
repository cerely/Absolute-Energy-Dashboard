/* eslint-disable max-len */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { useAppSelector } from '../redux/reduxHooks';
import { selectOptionsVisibility } from '../redux/slices/appStateSlice';
import { selectChartToRender } from '../redux/slices/graphSlice';
import { ChartTypes } from '../types/redux/graph';
import BarChartComponent from './BarChartComponent';
import LineChartComponent from './LineChartComponent';
import MapChartComponent from './MapChartComponent';
import MultiCompareChartComponent from './MultiCompareChartComponent';
import RadarChartComponent from './RadarChartComponent';
import UIOptionsComponent from './UIOptionsComponent';
import PlotNavComponent from './PlotNavComponent';
import CompareLineChartComponent from './CompareLineChartComponent';
// import Sidebar from './sidebar';
import './dashboard.css';

/**
 * React component that controls the dashboard
 * @returns the Primary Dashboard Component comprising of Ui Controls, and
 */
export default function DashboardComponent() {
	const chartToRender = useAppSelector(selectChartToRender);
	const optionsVisibility = useAppSelector(selectOptionsVisibility);

	return (
		<>
			{/* Options Panel (Chart Controls) - Now a Row on Top */}
			{optionsVisibility && (
				<div className="options-panel">
					<UIOptionsComponent />
				</div>
			)}

			{/* Charts Area */}
			<div className="dashboard-container" style={{ margin: 0, flexGrow: 1, height: '100%', overflow: 'hidden', display: 'flex', flexDirection: 'column', padding: '0' }}>
				<div className="dashboard-main">
					<div className="chart-card-container">
						<div style={{
							position: 'absolute',
							top: '0px',
							left: 'auto',
							right: '180px',
							zIndex: 50,
							pointerEvents: 'none', // Allow clicks to pass through spacer
							width: 'auto',
							padding: '10px'
						}}>
							{chartToRender !== ChartTypes.line && <PlotNavComponent />}
						</div>
						{chartToRender === ChartTypes.line && <LineChartComponent />}
						{chartToRender === ChartTypes.bar && <BarChartComponent />}
						{chartToRender === ChartTypes.compare && <MultiCompareChartComponent />}
						{chartToRender === ChartTypes.map && <MapChartComponent />}
						{/* 3D rendering disabled */}
						{chartToRender === ChartTypes.radar && <RadarChartComponent />}
						{chartToRender === ChartTypes.compareLine && <CompareLineChartComponent />}
					</div>
				</div>
			</div>
		</>
	);
}