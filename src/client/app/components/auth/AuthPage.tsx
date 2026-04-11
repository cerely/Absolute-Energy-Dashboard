/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAppDispatch } from '../../redux/reduxHooks';
import { authApi } from '../../redux/api/authApi';
import './auth.css';
import { showErrorNotification, showSuccessNotification } from '../../utils/notifications';

interface AuthPageProps {
	initialMode?: 'login' | 'signup';
}

const AuthPage: React.FC<AuthPageProps> = ({ initialMode = 'login' }) => {
	const navigate = useNavigate();
	const location = useLocation();
	
	const [mode, setMode] = useState<'login' | 'signup'>(initialMode);
	const [username, setUsername] = useState('');
	const [password, setPassword] = useState('');
	const [showPassword, setShowPassword] = useState(false);
	const [email, setEmail] = useState('');
	const [error, setError] = useState<string | null>(null);
	const [isLoading, setIsLoading] = useState(false);

	const [loginMutation] = authApi.endpoints.login.useMutation();
	
	const handleAuth = async (e: React.FormEvent) => {
		e.preventDefault();
		setError(null);
		setIsLoading(true);

		try {
			const endpoint = mode === 'login' ? '/api/auth/login' : '/api/auth/signup';
			const body = mode === 'login' 
				? { username, password } 
				: { username, password, email };

			const response = await fetch(endpoint, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(body)
			});

			const data = await response.json();

			if (!response.ok) {
				throw new Error(data.message || 'Authentication failed');
			}
			
			if (mode === 'login') {
				await loginMutation({ username, password }).unwrap();
			} else {
				showSuccessNotification('Account created successfully!');
				setMode('login');
				setIsLoading(false);
				return;
			}

			showSuccessNotification(data.message || (mode === 'login' ? 'Welcome back!' : 'Welcome!'));
			const origin = (location.state as any)?.from?.pathname || '/';
			navigate(origin);

		} catch (err: any) {
			setError(err.message);
			showErrorNotification(err.message);
		} finally {
			setIsLoading(false);
		}
	};

	return (
		<div className="auth-container">
			<div className="auth-card">
				<div className="auth-header">
					<img src="/abs-logo.png" alt="Logo" className="auth-logo" />
					<h1 className="auth-title">
						{mode === 'login' ? 'Login' : 'Signup'}
					</h1>
					<p className="auth-subtitle">
						{mode === 'login' 
							? 'Welcome back to Absolute Energy Dashboard' 
							: 'Join us to start monitoring your energy efficiency'}
					</p>
				</div>

				{error && <div className="error-msg">{error}</div>}

				<form onSubmit={handleAuth}>
					<div className="form-group-custom">
						<label className="custom-label">Username</label>
						<input
							type="text"
							className="custom-input w-100"
							placeholder="Enter your username"
							value={username}
							onChange={(e) => setUsername(e.target.value)}
							required
							minLength={3}
						/>
					</div>

					{mode === 'signup' && (
						<div className="form-group-custom">
							<label className="custom-label">Email Address</label>
							<input
								type="email"
								className="custom-input w-100"
								placeholder="name@company.com"
								value={email}
								onChange={(e) => setEmail(e.target.value)}
								required
							/>
						</div>
					)}

					<div className="form-group-custom">
						<label className="custom-label">Password</label>
						<div style={{ position: 'relative' }}>
							<input
								type={showPassword ? "text" : "password"}
								className="custom-input w-100"
								placeholder="••••••••"
								value={password}
								onChange={(e) => setPassword(e.target.value)}
								required
								minLength={8}
							/>
							<button 
								type="button"
								onClick={() => setShowPassword(!showPassword)}
								style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', padding: '4px' }}
							>
								<span className="material-symbols-rounded" style={{ fontSize: '20px' }}>
									{showPassword ? 'visibility_off' : 'visibility'}
								</span>
							</button>
						</div>
					</div>

					<button 
						type="submit" 
						className="auth-button"
						disabled={isLoading}
					>
						{isLoading ? 'Processing...' : (mode === 'login' ? 'Sign In' : 'Create Account')}
					</button>
				</form>

				<div className="auth-footer">
					{mode === 'login' ? (
						<>
							Don't have an account? 
							<a href="#" className="auth-link" onClick={() => setMode('signup')}>Sign Up</a>
						</>
					) : (
						<>
							Already have an account? 
							<a href="#" className="auth-link" onClick={() => setMode('login')}>Sign In</a>
						</>
					)}
				</div>
			</div>
		</div>
	);
};

export default AuthPage;
