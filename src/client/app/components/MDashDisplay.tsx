/* eslint-disable no-trailing-spaces */
/* eslint-disable jsdoc/require-param-description */
/* eslint-disable @typescript-eslint/indent */
/* eslint-disable jsdoc/require-returns */
// import { func } from 'prop-types';
import MainDashboard from './MainDashboard';
import Sidebar from './sidebar';

interface MainDash {
	children?: React.ReactNode | undefined
}

/**
 *
 * @param props
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export default function MDashDisplay(props: MainDash) {
	return (
		<>
			<div style={{ padding: '20px' }}>   
                <Sidebar />
                <MainDashboard />
            </div>
		</>
	);
}