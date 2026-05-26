import axios from "axios";
import { getCookie } from "../utils/cookieHelper";
import { customersURL } from "../config/config";

export const getCustomerByEmail = async (email) => {
    try {
        const token = await getCookie('sales-coach-extension-token');
        const headers = token ? { Authorization: `Bearer ${token}` } : {};
        const response = await axios.get(`${customersURL}/getCustomerByEmail/${email}`, { headers });
        return response;
    } catch (error) {
        console.log(error);
    }
};

export const userLogin = async (data) => {
    return new Promise((resolve, reject) => {
        chrome.runtime.sendMessage({
            type: 'FETCH_PROXY',
            url: `${customersURL}/login`,
            method: 'POST',
            data: data
        }, (response) => {
            if (response && response.success) {
                resolve({ data: response.data });
            } else {
                console.error("Error in proxy login:", response?.error);
                reject(new Error(response?.error || "Unknown error during login"));
            }
        });
    });
};