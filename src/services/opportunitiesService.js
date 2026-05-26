import axios from "axios";
import { getCookie } from "../utils/cookieHelper";
import { opportunityURL } from "../config/config";

export const getOpportunitiesByCustomerId = async (customerId) => {
    try {
        const token = await getCookie('sales-coach-extension-token');
        const headers = token ? { Authorization: `Bearer ${token}` } : {};
        const response = await axios.get(`${opportunityURL}/get/all/options?id=${customerId}`, { headers });
        return response;
    } catch (error) {
        console.error("Error fetching opportunities:", error);
        throw error;
    }
};

export const updateOpportunityData = async (data) => {
    const token = await getCookie('sales-coach-extension-token');
    const headers = token ? { Authorization: `Bearer ${token}` } : {};
    return new Promise((resolve, reject) => {
        chrome.runtime.sendMessage({
            type: 'FETCH_PROXY',
            url: `${opportunityURL}/updateOpportunityData`,
            method: 'POST',
            data: data,
            headers: headers
        }, (response) => {
            if (response && response.success) {
                resolve({ data: response.data });
            } else {
                console.error("Error in proxy fetch:", response?.error);
                reject(new Error(response?.error || "Unknown error during proxy fetch"));
            }
        });
    });
};

export const createOpportunityData = async (data) => {
    const token = await getCookie('sales-coach-extension-token');
    const headers = token ? { Authorization: `Bearer ${token}` } : {};
    return new Promise((resolve, reject) => {
        chrome.runtime.sendMessage({
            type: 'FETCH_PROXY',
            url: `${opportunityURL}/createOpportunityData`,
            method: 'POST',
            data: data,
            headers: headers
        }, (response) => {
            if (response && response.success) {
                resolve({ data: response.data });
            } else {
                console.error("Error in proxy fetch:", response?.error);
                reject(new Error(response?.error || "Unknown error during proxy fetch"));
            }
        });
    });
};