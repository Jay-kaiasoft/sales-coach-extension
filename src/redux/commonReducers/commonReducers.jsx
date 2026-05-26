import { createSlice } from "@reduxjs/toolkit";

const initialState = {
  loading: false,
  alert: { open: false, message: '', type: '' },
};

const commonReducersSlice = createSlice({
  name: "commonReducers",
  initialState,
  reducers: {
    setLoading(state, action) {
      state.loading = action.payload;
    },
    setAlert(state, action) {
      state.alert = action.payload;
    },   
  },
});

export const {
  setLoading,
  setAlert,
} = commonReducersSlice.actions;

export default commonReducersSlice.reducer;
