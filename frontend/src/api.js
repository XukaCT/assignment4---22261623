import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';

export const api = {
  // Run management
  listRuns: () => axios.get(`${API_URL}/runs`),
  getLatestRun: () => axios.get(`${API_URL}/runs/latest`),
  initRun: (body = {}) => axios.post(`${API_URL}/runs/init`, body),
  simulateRun: (runId) => axios.post(`${API_URL}/runs/${runId}/simulate`),

  // Reports (read-only)
  getConfig: (runId) => axios.get(`${API_URL}/runs/${runId}/config`),
  getSummary: (runId) => axios.get(`${API_URL}/runs/${runId}/summary`),
  getDailyReport: (runId, day) => axios.get(`${API_URL}/runs/${runId}/daily/${day}`),
  getDailyTransactions: (runId, day) => axios.get(`${API_URL}/runs/${runId}/daily/${day}/transactions`),
  getProductTrace: (runId, productId) => axios.get(`${API_URL}/runs/${runId}/products/${productId}/trace`),
  getAssurance: (runId) => axios.get(`${API_URL}/runs/${runId}/assurance`),
};
