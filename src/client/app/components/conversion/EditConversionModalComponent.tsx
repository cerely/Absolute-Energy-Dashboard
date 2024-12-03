/* This Source Code Form is subject to the terms of the Mozilla Public
* License, v. 2.0. If a copy of the MPL was not distributed with this
* file, You can obtain one at http://mozilla.org/MPL/2.0/. */
import * as React from 'react';
// Realize that * is already imported from react
import { useState } from 'react';
import { FormattedMessage } from 'react-intl';
import { Button, Col, Container, FormGroup, Input, Label, Modal, ModalBody, ModalFooter, ModalHeader, Row } from 'reactstrap';
import TooltipHelpComponent from '../TooltipHelpComponent';
import { conversionsApi, selectConversionsDetails } from '../../redux/api/conversionsApi';
import { selectMeterDataById } from '../../redux/api/metersApi';
import { selectUnitDataById } from '../../redux/api/unitsApi';
import { useAppSelector } from '../../redux/reduxHooks';
import '../../styles/modal.css';
import { tooltipBaseStyle } from '../../styles/modalStyle';
import { TrueFalseType } from '../../types/items';
import { ConversionData } from '../../types/redux/conversions';
import { UnitData, UnitType } from '../../types/redux/units';
import { useTranslate } from '../../redux/componentHooks';
import ConfirmActionModalComponent from '../ConfirmActionModalComponent';
import TooltipMarkerComponent from '../TooltipMarkerComponent';

interface EditConversionModalComponentProps {
	show: boolean;
	conversion: ConversionData;
	conversionIdentifier: string;
	// passed in to handle opening the modal
	handleShow: () => void;
	// passed in to handle closing the modal
	handleClose: () => void;
}

/**
 * Defines the edit conversion modal form
 * @param props Props for the component
 * @returns Conversion edit element
 */
export default function EditConversionModalComponent(props: EditConversionModalComponentProps) {
	const translate = useTranslate();
	const [editConversion] = conversionsApi.useEditConversionMutation();
	const [deleteConversion] = conversionsApi.useDeleteConversionMutation();
	const unitDataById = useAppSelector(selectUnitDataById);
	const meterDataById = useAppSelector(selectMeterDataById);
	const conversionDetails = useAppSelector(selectConversionsDetails);

	// Set existing conversion values
	const values = { ...props.conversion };

	/* State */
	// Handlers for each type of input change
	const [state, setState] = useState(values);

	const handleStringChange = (e: React.ChangeEvent<HTMLInputElement>) => {
		setState({ ...state, [e.target.name]: e.target.value });
	};

	const handleBooleanChange = (e: React.ChangeEvent<HTMLInputElement>) => {
		setState({ ...state, [e.target.name]: JSON.parse(e.target.value) });
	};

	const handleNumberChange = (e: React.ChangeEvent<HTMLInputElement>) => {
		setState({ ...state, [e.target.name]: Number(e.target.value) });
	};
	/* End State */

	const getConversionCount = (unit: UnitData, conversions: ConversionData[]) => {
		let count = 0;
		if (unit === unitDataById[state.sourceId]) {
			for (const conversion of Object.values(conversions)) {
				if (conversion.sourceId === unit.id) {
					count++;
				}
			}
		} else if (unit === unitDataById[state.destinationId]) {
			for (const conversion of Object.values(conversions)) {
				if (conversion.destinationId === unit.id) {
					count++;
				}
			}
		}
		return count;
	};

	const checkState = () => {
		const source = unitDataById[state.sourceId];
		const dest = unitDataById[state.destinationId];
		let msg = '';
		let cancel = false;
		if (source.typeOfUnit === UnitType.meter) {
			const count = getConversionCount(source, conversionDetails);
			if (count === 1) {
				msg += `Deleting this meter conversion will orphan ${unitDataById[state.destinationId].name}.\n`;
			} else {
				msg += 'Deleting this meter conversion will make the following meters ungraphable:\n';
				for (const meterId of Object.values(meterDataById)) {
					if (meterId.unitId == source.id) {
						msg += `${meterId.name}\n`;
						cancel = true;
					}
				}
			}
		} else if (source.typeOfUnit === UnitType.suffix) {
			const count = getConversionCount(source, conversionDetails);
			if (count === 1) {
				msg += `Deleting this suffix conversion will disable use of ${source.name}.\n`;
			}
		} else if (source.typeOfUnit === UnitType.unit && dest.typeOfUnit === UnitType.unit) {
			const destCount = getConversionCount(dest, conversionDetails);
			if (destCount === 1) {
				msg += `Deleting this unit conversion will orphan ${unitDataById[state.destinationId].name}.\n`;
			}
			if (state.bidirectional) {
				const sourceCount = getConversionCount(source, conversionDetails);
				if (sourceCount === 1) {
					msg += `Deleting this unit conversion will orphan ${unitDataById[state.destinationId].name}.\n`;
				}
			}
			if (msg = '') {
				msg += 'Deleting this unit conversion between two units of type unit will have consequences.\n';
			}
		}

		if (msg === '') {
			handleDeleteConfirmationModalOpen();
		} else if (cancel) {
			setDeleteConfirmationMessage(msg + 'This conversion cannot be deleted.\n');
			handleCancelModalOpen();
		} else {
			setDeleteConfirmationMessage(msg + deleteConfirmationMessage);
			handleDeleteConfirmationModalOpen();
		}
	};

	/* Confirm Delete Modal */
	// Separate from state comment to keep everything related to the warning confirmation modal together
	const [showDeleteConfirmationModal, setShowDeleteConfirmationModal] = useState(false);
	const [showCancelModal, setShowCancelModal] = useState(false);
	const [deleteConfirmationMessage, setDeleteConfirmationMessage] = useState(
		translate('conversion.delete.conversion') + ' [' + props.conversionIdentifier + '] ?');
	const deleteConfirmText = translate('conversion.delete.conversion');
	const deleteRejectText = translate('cancel');
	// The first two handle functions below are required because only one Modal can be open at a time (properly)
	const handleDeleteConfirmationModalClose = () => {
		// Hide the warning modal
		setShowDeleteConfirmationModal(false);
		// Show the edit modal
		handleShow();
	};
	const handleDeleteConfirmationModalOpen = () => {
		// Hide the edit modal
		handleClose();
		// Show the warning modal
		setShowDeleteConfirmationModal(true);
	};
	const handleDeleteConversion = () => {
		// Closes the warning modal
		// Do not call the handler function because we do not want to open the parent modal
		setShowDeleteConfirmationModal(false);

		// Delete the conversion using the state object, it should only require the source and destination ids set
		deleteConversion({ sourceId: state.sourceId, destinationId: state.destinationId });
	};

	const handleCancelModalClose = () => {
		// Hide the warning modal
		setShowCancelModal(false);
		// Show the edit modal
		handleShow();
	};
	const handleCancelModalOpen = () => {
		// Hide the edit modal
		handleClose();
		// Show the warning modal
		setShowCancelModal(true);
	};
	const handleCancel = () => {
		// Closes the warning modal
		setShowCancelModal(false);
	};

	/* End Confirm Delete Modal */

	// Reset the state to default values
	// To be used for the discard changes button
	// Different use case from CreateConversionModalComponent's resetState
	// This allows us to reset our state to match the store in the event of an edit failure
	// Failure to edit conversions will not trigger a re-render, as no state has changed. Therefore, we must manually reset the values
	const resetState = () => {
		setState(values);
	};

	const handleShow = () => {
		props.handleShow();
	};

	const handleClose = () => {
		resetState();
		props.handleClose();
	};

	// Save changes
	// Currently using the old functionality which is to compare inherited prop values to state values
	// If there is a difference between props and state, then a change was made
	// Side note, we could probably just set a boolean when any input i
	// Edit Conversion Validation: is not needed as no breaking edits can be made
	const handleSaveChanges = () => {
		// Close the modal first to avoid repeat clicks
		props.handleClose();

		// Need to redo Cik if slope, intercept, or bidirectional changes.
		const shouldRedoCik = props.conversion.slope !== state.slope
			|| props.conversion.intercept !== state.intercept
			|| props.conversion.bidirectional !== state.bidirectional;
		// Check for changes by comparing state to props
		const conversionHasChanges = shouldRedoCik || props.conversion.note != state.note;
		// Only do work if there are changes
		if (conversionHasChanges) {
			// Save our changes
			editConversion({ conversionData: state, shouldRedoCik });
		}
	};

	const tooltipStyle = {
		...tooltipBaseStyle,
		tooltipEditConversionView: 'help.admin.conversionedit'
	};

	return (
		<>
			<ConfirmActionModalComponent
				show={showDeleteConfirmationModal}
				actionConfirmMessage={deleteConfirmationMessage}
				handleClose={handleDeleteConfirmationModalClose}
				actionFunction={handleDeleteConversion}
				actionConfirmText={deleteConfirmText}
				actionRejectText={deleteRejectText} />
			<ConfirmActionModalComponent
				show={showCancelModal}
				actionConfirmMessage={deleteConfirmationMessage}
				handleClose={handleCancelModalClose}
				actionFunction={handleCancel}
				actionConfirmText={deleteRejectText}
				actionRejectText={deleteRejectText}
				forceCancel={true} />
			<Modal isOpen={props.show} toggle={props.handleClose}>
				<ModalHeader>
					<FormattedMessage id="conversion.edit.conversion" />
					<TooltipHelpComponent page='conversions-edit' />
					<div style={tooltipStyle}>
						<TooltipMarkerComponent page='conversions-edit' helpTextId={tooltipStyle.tooltipEditConversionView} />
					</div>
				</ModalHeader>
				{/* when any of the conversion are changed call one of the functions. */}
				<ModalBody>
					<Container>
						<Row xs='1' lg='2'>
							<Col>
								{/* Source unit - display only */}
								<FormGroup>
									<Label for='sourceId'>{translate('conversion.source')}</Label>
									<Input
										id='sourceId'
										name='sourceId'
										type='text'
										defaultValue={unitDataById[state.sourceId]?.identifier}
										// Disable input to prevent changing ID value
										disabled>
									</Input>
								</FormGroup>
							</Col>
							<Col>
								{/* Destination unit - display only */}
								<FormGroup>
									<Label for='destinationId'>{translate('conversion.destination')}</Label>
									<Input
										id='destinationId'
										name='destinationId'
										type='text'
										defaultValue={unitDataById[state.destinationId]?.identifier}
										// Disable input to prevent changing ID value
										disabled>
									</Input>
								</FormGroup>
							</Col>
						</Row>
						{/* Bidirectional Y/N input */}
						<FormGroup>
							<Label for='bidirectional'>{translate('conversion.bidirectional')}</Label>
							<Input
								id='bidirectional'
								name='bidirectional'
								type='select'
								defaultValue={state.bidirectional.toString()}
								onChange={e => handleBooleanChange(e)}>
								{Object.keys(TrueFalseType).map(key => {
									return (<option value={key} key={key}>{translate(`TrueFalseType.${key}`)}</option>);
								})}
							</Input>
						</FormGroup>
						<Row xs='1' lg='2'>
							<Col>
								{/* Slope input */}
								<FormGroup>
									<Label for='slope'>{translate('conversion.slope')}</Label>
									<Input
										id='slope'
										name='slope'
										type='number'
										value={state.slope}
										onChange={e => handleNumberChange(e)} />
								</FormGroup>
							</Col>
							<Col>
								{/* Intercept input */}
								<FormGroup>
									<Label for='intercept'>{translate('conversion.intercept')}</Label>
									<Input
										id='intercept'
										name='intercept'
										type='number'
										value={state.intercept}
										onChange={e => handleNumberChange(e)} />
								</FormGroup>
							</Col>
						</Row>
						{/* Note input */}
						<FormGroup>
							<Label for='note'>{translate('note')}</Label>
							<Input
								id='note'
								name='note'
								type='textarea'
								defaultValue={state.note}
								placeholder='Note'
								onChange={e => handleStringChange(e)} />
						</FormGroup>
					</Container>
				</ModalBody>
				<ModalFooter>
					<Button color='danger' onClick={checkState}>
						<FormattedMessage id="conversion.delete.conversion" />
					</Button>
					{/* Hides the modal */}
					<Button color='secondary' onClick={handleClose}>
						<FormattedMessage id="discard.changes" />
					</Button>
					{/* On click calls the function handleSaveChanges in this component */}
					<Button color='primary' onClick={handleSaveChanges}>
						<FormattedMessage id="save.all" />
					</Button>
				</ModalFooter>
			</Modal>
		</>
	);
}
