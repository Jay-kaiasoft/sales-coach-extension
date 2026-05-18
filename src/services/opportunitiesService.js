import axios from "axios";
import { opportunityURL } from "../config/config";

export const getOpportunitiesByCustomerId = async (customerId) => {
    try {
        const response = await axios.get(`${opportunityURL}/get/all/options?id=${customerId}`);
        return response;
    } catch (error) {
        console.error("Error fetching opportunities:", error);
        throw error;
    }
};

export const updateOpportunityData = async (data) => {
    return new Promise((resolve, reject) => {
        chrome.runtime.sendMessage({
            type: 'FETCH_PROXY',
            url: `${opportunityURL}/updateOpportunityData`,
            method: 'POST',
            data: data
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
    return new Promise((resolve, reject) => {
        chrome.runtime.sendMessage({
            type: 'FETCH_PROXY',
            url: `${opportunityURL}/createOpportunityData`,
            method: 'POST',
            data: data
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