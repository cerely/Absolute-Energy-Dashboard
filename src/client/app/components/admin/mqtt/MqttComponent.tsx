import * as React from 'react';
import { useState, useEffect } from 'react';
import { Form, FormGroup, Label, Input, Button, Spinner, Badge } from 'reactstrap';
import { titleStyle } from '../../../styles/modalStyle';
import TooltipHelpComponent from '../../TooltipHelpComponent';
import { toast } from 'react-toastify';
import { useAppDispatch } from '../../../redux/reduxHooks';
import { baseApi } from '../../../redux/api/baseApi';
import { updateSelectedMeters, updateSelectedGroups } from '../../../redux/slices/graphSlice';


interface MqttSource {
	id: number;
	broker_url: string;
	topic: string;
	client_id: string;
	username: string;
	password: string;
	filters: string;
	created_at: string;
}

const emptyConfig = {
	broker_url: '',
	topic: '',
	client_id: '',
	username: '',
	password: '',
	filters: ''
};

export default function MqttComponent() {
	const dispatch = useAppDispatch();
	const [loading, setLoading] = useState(true);

	const [saving, setSaving] = useState(false);
	const [switching, setSwitching] = useState<number | null>(null);
	const [sources, setSources] = useState<MqttSource[]>([]);
	const [activeId, setActiveId] = useState<number | null>(null);
	const [editingId, setEditingId] = useState<number | null>(null); // null = new source mode
	const [config, setConfig] = useState(emptyConfig);
	const [showForm, setShowForm] = useState(false);

	useEffect(() => {
		fetchSources();
	}, []);

	const fetchSources = async () => {
		try {
			const res = await fetch('/api/mqtt');
			if (res.ok) {
				const data = await res.json();
				setSources(data.sources || []);
				setActiveId(data.activeId);
			}
		} catch (error) {
			console.error('Failed to fetch MQTT sources:', error);
			toast.error('Failed to load MQTT configuration.');
		} finally {
			setLoading(false);
		}
	};

	const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
		const { name, value } = e.target;
		setConfig(prev => ({ ...prev, [name]: value }));
	};

	const handleNewTopic = () => {
		setEditingId(null);
		setConfig(emptyConfig);
		setShowForm(true);
	};

	const handleEditTopic = (source: MqttSource) => {
		setEditingId(source.id);
		setConfig({
			broker_url: source.broker_url || '',
			topic: source.topic || '',
			client_id: source.client_id || '',
			username: source.username || '',
			password: source.password || '',
			filters: source.filters || ''
		});
		setShowForm(true);
	};

	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault();
		setSaving(true);
		try {
			const isEdit = editingId !== null;
			const url = isEdit ? `/api/mqtt/${editingId}` : '/api/mqtt';
			const method = isEdit ? 'PUT' : 'POST';

			const res = await fetch(url, {
				method,
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(config)
			});
			if (res.ok) {
				toast.success(isEdit
					? 'MQTT source updated successfully.'
					: 'New MQTT source saved and activated.'
				);
				setShowForm(false);
				setEditingId(null);
				setConfig(emptyConfig);
				await fetchSources();
			} else {
				throw new Error('Failed to save.');
			}
		} catch (error) {
			toast.error('Error saving MQTT configuration.');
		} finally {
			setSaving(false);
		}
	};

	const handleSwitchActive = async (id: number) => {
		setSwitching(id);
		try {
			const res = await fetch(`/api/mqtt/active/${id}`, { method: 'PUT' });
			if (res.ok) {
				setActiveId(id);
				// Invalidate so selectors re-fetch the new active source and re-filter meters
				dispatch(baseApi.util.invalidateTags(['ActiveMqttSource', 'MeterData']));
				// Clear selected meters/groups so stale cross-topic selections don't appear in charts
				dispatch(updateSelectedMeters([]));
				dispatch(updateSelectedGroups([]));
				toast.success('Switched to topic. Dashboard now shows only data for this source.');
			} else {
				throw new Error('Failed to switch.');
			}
		} catch (error) {
			toast.error('Error switching MQTT source.');
		} finally {
			setSwitching(null);
		}
	};


	const handleDisable = async (id: number) => {
		if (!window.confirm('Disable this MQTT source? Data will be preserved but the client will stop.')) return;
		try {
			const res = await fetch(`/api/mqtt/${id}`, { method: 'DELETE' });
			if (res.ok) {
				toast.success('MQTT source disabled.');
				await fetchSources();
				dispatch(baseApi.util.invalidateTags(['ActiveMqttSource', 'MeterData']));
				dispatch(updateSelectedMeters([]));
				dispatch(updateSelectedGroups([]));
			} else {

				throw new Error('Failed to disable.');
			}
		} catch (error) {
			toast.error('Error disabling MQTT source.');
		}
	};

	const handleCancel = () => {
		setShowForm(false);
		setEditingId(null);
		setConfig(emptyConfig);
	};

	return (
		<div>
			<TooltipHelpComponent page='admin' />

			<div className='container-fluid'>
				<div className='row justify-content-center mt-4'>
					<div className='col-12 col-md-10 col-lg-8'>

						{/* ── Info Banner ── */}
						<div className="card p-3 mb-4 shadow-sm" style={{ borderLeft: '4px solid #007bff' }}>
							<p className="mb-0" style={{ fontSize: '14px' }}>
								<strong>Multi-Topic Support:</strong> Configure multiple MQTT topics. Each topic stores its own meters and readings independently.
								Switching topics changes the dashboard context without deleting any data.
							</p>
						</div>

						{loading ? (
							<div className="text-center py-5">
								<Spinner color="primary" />
							</div>
						) : (
							<>
								{/* ── Source Cards ── */}
								{sources.length > 0 && (
									<div className="mb-4">
										<div className="d-flex justify-content-between align-items-center mb-3">
											<h5 className="mb-0" style={{ fontWeight: 600 }}>Saved Topics</h5>
											<Button color="primary" size="sm" onClick={handleNewTopic}>
												<span style={{ fontWeight: 600 }}>+ Add New Topic</span>
											</Button>
										</div>
										{sources.map(source => (
											<div
												key={source.id}
												className="card mb-2 shadow-sm"
												style={{
													borderLeft: source.id === activeId ? '4px solid #28a745' : '4px solid #dee2e6',
													transition: 'all 0.2s ease'
												}}
											>
												<div className="card-body py-3 px-4">
													<div className="d-flex justify-content-between align-items-center">
														<div style={{ flex: 1 }}>
															<div className="d-flex align-items-center gap-2 mb-1">
																<strong style={{ fontSize: '15px' }}>
																	{source.topic || '(no topic)'}
																</strong>
																{source.id === activeId && (
																	<Badge color="success" pill style={{ fontSize: '11px' }}>
																		ACTIVE
																	</Badge>
																)}
															</div>
															<div style={{ fontSize: '12px', color: '#6c757d' }}>
																<span>Broker: {source.broker_url}</span>
																{source.filters && (
																	<span className="ms-3">Filters: {source.filters}</span>
																)}
																<span className="ms-3">ID: {source.id}</span>
															</div>
														</div>
														<div className="d-flex gap-2">
															{source.id !== activeId && (
																<Button
																	color="success"
																	size="sm"
																	outline
																	onClick={() => handleSwitchActive(source.id)}
																	disabled={switching === source.id}
																>
																	{switching === source.id ? <Spinner size="sm" /> : 'Activate'}
																</Button>
															)}
															<Button
																color="secondary"
																size="sm"
																outline
																onClick={() => handleEditTopic(source)}
															>
																Edit
															</Button>
															<Button
																color="danger"
																size="sm"
																outline
																onClick={() => handleDisable(source.id)}
															>
																Disable
															</Button>
														</div>
													</div>
												</div>
											</div>
										))}
									</div>
								)}

								{sources.length === 0 && !showForm && (
									<div className="text-center py-5">
										<p className="text-muted mb-3">No MQTT sources configured yet.</p>
										<Button color="primary" onClick={handleNewTopic}>
											Add Your First MQTT Topic
										</Button>
									</div>
								)}

								{/* ── Add/Edit Form ── */}
								{showForm && (
									<div className="card p-4 shadow-sm mb-4">
										<h5 className="mb-3" style={{ fontWeight: 600 }}>
											{editingId ? 'Edit MQTT Source' : 'Add New MQTT Source'}
										</h5>
										<Form onSubmit={handleSubmit}>
											<FormGroup>
												<Label for="broker_url">Broker URL</Label>
												<Input
													type="text"
													name="broker_url"
													id="broker_url"
													placeholder="e.g. mqtts://broker.hivemq.com:8883"
													value={config.broker_url}
													onChange={handleChange}
													required
												/>
											</FormGroup>

											<FormGroup>
												<Label for="topic">Topic (e.g. devices/Device01/telemetry)</Label>
												<Input
													type="text"
													name="topic"
													id="topic"
													placeholder="#"
													value={config.topic}
													onChange={handleChange}
													required
												/>
											</FormGroup>

											<FormGroup>
												<Label for="filters">Filters (comma-separated ignored prefixes)</Label>
												<Input
													type="text"
													name="filters"
													id="filters"
													placeholder="e.g. FlowMeter/, Delta_PLC/"
													value={config.filters}
													onChange={handleChange}
												/>
												<small className="form-text text-muted">Meters matching these prefixes will NOT be stored.</small>
											</FormGroup>

											<FormGroup>
												<Label for="client_id">Client ID (optional)</Label>
												<Input
													type="text"
													name="client_id"
													id="client_id"
													placeholder="Leave blank for auto-generated ID"
													value={config.client_id}
													onChange={handleChange}
												/>
											</FormGroup>

											<div className="row">
												<div className="col-md-6">
													<FormGroup>
														<Label for="username">Username (optional)</Label>
														<Input
															type="text"
															name="username"
															id="username"
															value={config.username}
															onChange={handleChange}
														/>
													</FormGroup>
												</div>
												<div className="col-md-6">
													<FormGroup>
														<Label for="password">Password (optional)</Label>
														<Input
															type="text"
															name="password"
															id="password"
															value={config.password}
															onChange={handleChange}
														/>
													</FormGroup>
												</div>
											</div>

											<div className="mt-4 d-flex justify-content-between">
												<div className="d-flex gap-2">
													<Button type="submit" color="primary" disabled={saving}>
														{saving ? <Spinner size="sm" /> : (editingId ? 'Update Source' : 'Save & Activate')}
													</Button>
													<Button type="button" color="secondary" outline onClick={handleCancel}>
														Cancel
													</Button>
												</div>
											</div>
										</Form>
									</div>
								)}
							</>
						)}
					</div>
				</div>

				{/* ── Database Configuration ── */}
				<DatabaseConfig />
			</div>
		</div>
	);
}

function DatabaseConfig() {
	const [loading, setLoading] = useState(true);
	const [saving, setSaving] = useState(false);
	const [dbConfig, setDbConfig] = useState({
		host: '',
		port: '5432',
		user: '',
		password: '',
		database: ''
	});

	useEffect(() => {
		fetch('/api/db-config')
			.then(r => r.json())
			.then(data => { setDbConfig(data); setLoading(false); })
			.catch(() => setLoading(false));
	}, []);

	const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
		const { name, value } = e.target;
		setDbConfig(prev => ({ ...prev, [name]: value }));
	};

	const handleSave = async (e: React.FormEvent) => {
		e.preventDefault();
		setSaving(true);
		try {
			const res = await fetch('/api/db-config', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(dbConfig)
			});
			const data = await res.json();
			if (res.ok) {
				toast.success(data.message || 'Database config saved. Restart server to apply.');
			} else {
				throw new Error(data.error || 'Failed to save.');
			}
		} catch (err: any) {
			toast.error('Error saving database config: ' + err.message);
		} finally {
			setSaving(false);
		}
	};

	return (
		<div className='row justify-content-center mt-4 mb-4'>
			<div className='col-12 col-md-8 col-lg-6'>
				<div className="card p-4 shadow-sm">
					<h5 className="mb-1" style={{ fontWeight: 600 }}>Database Configuration</h5>
					<p className="text-muted mb-4" style={{ fontSize: '13px' }}>
						Override the database connection settings. Values are saved to <code>.env</code> and take effect on server restart.
						These replace the hardcoded values in <code>docker-compose.yml</code>.
					</p>
					{loading ? (
						<div className="text-center"><Spinner color="secondary" /></div>
					) : (
						<Form onSubmit={handleSave}>
							<div className="row">
								<div className="col-md-8">
									<FormGroup>
										<Label for="db_host">Host</Label>
										<Input
											type="text"
											name="host"
											id="db_host"
											placeholder="e.g. database (Docker) or localhost"
											value={dbConfig.host}
											onChange={handleChange}
											required
										/>
									</FormGroup>
								</div>
								<div className="col-md-4">
									<FormGroup>
										<Label for="db_port">Port</Label>
										<Input
											type="number"
											name="port"
											id="db_port"
											placeholder="5432"
											value={dbConfig.port}
											onChange={handleChange}
											required
										/>
									</FormGroup>
								</div>
							</div>

							<FormGroup>
								<Label for="db_database">Database Name</Label>
								<Input
									type="text"
									name="database"
									id="db_database"
									placeholder="e.g. oed"
									value={dbConfig.database}
									onChange={handleChange}
									required
								/>
							</FormGroup>

							<div className="row">
								<div className="col-md-6">
									<FormGroup>
										<Label for="db_user">Username</Label>
										<Input
											type="text"
											name="user"
											id="db_user"
											placeholder="e.g. oed"
											value={dbConfig.user}
											onChange={handleChange}
											required
										/>
									</FormGroup>
								</div>
								<div className="col-md-6">
									<FormGroup>
										<Label for="db_password">Password</Label>
										<Input
											type="password"
											name="password"
											id="db_password"
											value={dbConfig.password}
											onChange={handleChange}
										/>
									</FormGroup>
								</div>
							</div>

							<div className="mt-3 d-flex align-items-center gap-2">
								<Button type="submit" color="secondary" disabled={saving}>
									{saving ? <Spinner size="sm" /> : 'Save to .env'}
								</Button>
								<small className="text-muted ms-2">⚠️ Restart the server container after saving to apply changes.</small>
							</div>
						</Form>
					)}
				</div>
			</div>
		</div>
	);
}
