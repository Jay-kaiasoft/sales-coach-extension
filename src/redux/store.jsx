import { configureStore } from "@reduxjs/toolkit";
import commonReducer from "./commonReducers/commonReducers";

const store = configureStore({
  reducer: {
    common: commonReducer,
  },
});

export default store;
