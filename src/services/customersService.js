import axios from "axios";
import { customersURL } from "../config/config";

export const getCustomerByEmail = async (email) => {
    try {
        const response = axios.get(`${customersURL}/getCustomerByEmail/${email}`)
        return response

    } catch (error) {
        console.log(error)
    }
}