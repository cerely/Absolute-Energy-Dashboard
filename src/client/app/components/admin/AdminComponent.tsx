/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */


import { FormattedMessage } from 'react-intl';
import TooltipHelpComponent from '../../components/TooltipHelpComponent';
import TooltipMarkerComponent from '../TooltipMarkerComponent';
import PreferencesComponent from './PreferencesComponent';
import { titleStyle, tooltipBaseStyle } from '../../styles/modalStyle';

/**
 * React component that defines the admin page
 * @returns Admin page element
 */
export default function AdminComponent() {
	return (
		<div>
			<TooltipHelpComponent page='admin' />

			<div className='container-fluid'>
				<div className='d-inline-flex flex-column align-items-center justify-content-center w-100'>
					<div className='col-12 col-lg-10'>
						<PreferencesComponent />
					</div>
				</div>
			</div>
		</div>
	);
}
