/* This Source Code Form is subject to the terms of the Mozilla Public
* License, v. 2.0. If a copy of the MPL was not distributed with this
* file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { stableEmptyUsers, userApi } from '../../../redux/api/userApi';
import { useTranslate } from '../../../redux/componentHooks';
import TooltipHelpComponent from '../../TooltipHelpComponent';
import TooltipMarkerComponent from '../../TooltipMarkerComponent';
import CreateUserModalComponent from './CreateUserModalComponent';
import UserViewComponent from './UserViewComponent';
import { selectSelectedLanguage } from '../../../redux/slices/appStateSlice';
import { useAppSelector } from '../../../redux/reduxHooks';
import { tooltipBaseStyle } from '../../../styles/modalStyle';

const tooltipStyle = {
	...tooltipBaseStyle,
	tooltipUsersView: 'help.admin.users'
};

/**
 * Component which shows user details
 * @returns User Detail element
 */
export default function UserDetailComponent() {
	const locale = useAppSelector(selectSelectedLanguage);
	const translate = useTranslate();
	const { data: users = stableEmptyUsers } = userApi.useGetUsersQuery();

	return (
		<div>
			<TooltipHelpComponent page='users' />
			<div className='container-fluid px-5'>

				<div className='edit-btn' style={{ paddingRight: '24px' }}>
					<CreateUserModalComponent />
				</div>
				<div className='card-container'>
					{// display users and sort by username alphabetically
						[...users]
							.sort((a, b) => a.username.localeCompare(b.username, locale, { sensitivity: 'accent' }))
							.map(user => (
								<UserViewComponent key={user.username} user={user} />
							))
					}
				</div>
			</div>
		</div>
	);
}

