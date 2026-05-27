import React, { useState, useRef, useEffect } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { useDispatch, useSelector } from 'react-redux';
import { setCookie } from '../utils/cookieHelper';
import { setAlert, setLoading } from '../redux/commonReducers/commonReducers';
import { userLogin } from '../services/customersService';

const Login = ({ onLoginSuccess }) => {
  const dispatch = useDispatch();
  const loading = useSelector(state => state.common.loading);
  const alert = useSelector(state => state.common.alert);

  const [isPasswordVisible, setIsPasswordVisible] = useState(false);
  const [loginPreference, setLoginPreference] = useState(null);

  const emailRef = useRef(null);
  const passwordRef = useRef(null);

  const {
    handleSubmit,
    control,
    reset,
    watch,
    setError,
    formState: { errors },
  } = useForm({
    defaultValues: {
      email: "",
      password: "",
    },
  });

  const togglePasswordVisibility = () => {
    setIsPasswordVisible(prev => !prev);
  };

  const onSubmit = async (data) => {
    dispatch(setLoading(true));
    dispatch(setAlert({ open: false, message: '', type: '' }));
    try {
      const res = await userLogin(data);
      if (res?.data?.result?.loginPreference) {
        setLoginPreference(res?.data?.result?.loginPreference || "password");
      } else if (res?.data?.status === 200 && res?.data?.result?.token) {
        // Set cookie 'sales-coach-extension-token' to expire in 24HR (1 day)
        await setCookie('sales-coach-extension-token', res?.data?.result?.token, 0.5);

        const userdata = {
          email: res?.data?.result?.email,
          userId: res?.data?.result?.userId,
          name: res?.data?.result?.name
        };
        await setCookie('sales-coach-extension-user-info', JSON.stringify(userdata), 0.5);

        dispatch(setAlert({ open: true, type: "success", message: res?.data?.message || "Login successful" }));

        if (onLoginSuccess) {
          onLoginSuccess(res?.data?.result?.token, userdata);
        }
      } else {
        dispatch(setAlert({
          open: true,
          type: "error",
          message: res?.data?.result?.error || res?.data?.msg || "Server error"
        }));
      }
    } catch (err) {
      console.error(err);
      dispatch(setAlert({
        open: true,
        type: "error",
        message: err.message || "An unexpected error occurred."
      }));
    } finally {
      dispatch(setLoading(false));
    }
  };

  useEffect(() => {
    if (loginPreference === "password" && passwordRef.current) {
      passwordRef.current.focus();
    }
  }, [loginPreference]);

  useEffect(() => {
    if (alert && alert.open) {
      const timer = setTimeout(() => {
        dispatch(setAlert({ open: false, message: '', type: '' }));
      }, 6000);
      return () => clearTimeout(timer);
    }
  }, [alert, dispatch]);

  return (
    <div className="flex flex-col min-h-screen bg-slate-50 font-sans text-slate-900 relative justify-center px-6 py-12">
      {/* Decorative top background element */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-80 h-80 bg-indigo-200/40 rounded-full blur-3xl pointer-events-none"></div>

      <div className="w-full max-w-sm mx-auto bg-white/80 backdrop-blur-md border border-slate-100 rounded-3xl p-6 shadow-xl relative z-10 transition-all duration-300">

        {/* Brand Header */}
        <div className="flex flex-col items-center mb-8">
          <div className="mb-4 w-12 h-12 bg-indigo-600 rounded-2xl flex items-center justify-center shadow-lg shadow-indigo-150 transform hover:rotate-12 transition-transform duration-300">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
          </div>
          <h2 className="text-xl font-black tracking-tight text-slate-900">Sign In</h2>
          <p className="text-xs text-slate-400 font-medium mt-1">Use your 360Pipe Credentials</p>
        </div>

        {/* Alert Banner */}
        {alert && alert.open && (
          <div className={`p-4 rounded-2xl mb-5 border flex items-start space-x-3 animate-slide-in transition-all ${alert.type === 'error'
              ? 'bg-red-50 text-red-700 border-red-100/50'
              : 'bg-emerald-50 text-emerald-700 border-emerald-100/50'
            }`}>
            <span className="text-base shrink-0 mt-0.5">{alert.type === 'error' ? '⚠️' : '✨'}</span>
            <p className="text-xs font-semibold leading-relaxed grow">{alert.message}</p>
            <button
              onClick={() => dispatch(setAlert({ open: false, message: '', type: '' }))}
              className="text-[10px] uppercase tracking-wider font-bold opacity-60 hover:opacity-100 cursor-pointer flex-shrink-0 mt-0.5"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Login Form */}
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-3">

            {/* Email / Username Field */}
            <div className="relative">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5 block">
                Email / Username
              </label>
              <div className="relative flex items-center">
                <span className="absolute left-4 text-slate-400">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4.5 w-4.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                  </svg>
                </span>
                <Controller
                  name="email"
                  control={control}
                  rules={{ required: "Email or Username is required" }}
                  render={({ field }) => (
                    <input
                      {...field}
                      ref={(e) => {
                        field.ref(e);
                        emailRef.current = e;
                      }}
                      type="text"
                      disabled={loginPreference === "password" || loading}
                      placeholder="Enter username or email"
                      className={`w-full pl-11 pr-10 py-3.5 bg-slate-50 border text-xs font-semibold rounded-2xl transition-all outline-hidden ${errors.email
                          ? 'border-red-300 focus:border-red-500 focus:bg-white focus:ring-4 focus:ring-red-100'
                          : 'border-slate-100 focus:border-indigo-500 focus:bg-white focus:ring-4 focus:ring-indigo-50/50'
                        } ${loginPreference === "password" ? 'opacity-65 cursor-not-allowed bg-slate-100' : ''}`}
                      onChange={(e) => {
                        const value = e.target.value.replace(/\s/g, "");
                        field.onChange(value);
                      }}
                    />
                  )}
                />
                {loginPreference === "password" && (
                  <button
                    type="button"
                    disabled={loading}
                    onClick={() => {
                      setLoginPreference(null);
                      reset({ email: "", password: "" });
                      setTimeout(() => emailRef.current?.focus(), 50);
                    }}
                    className="absolute right-4 text-slate-400 hover:text-slate-650 cursor-pointer"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                )}
              </div>
            </div>

            {/* Password Field (Rendered when preference is password) */}
            {loginPreference === "password" && (
              <div className="space-y-1.5 animate-slide-in">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5 block">
                  Password
                </label>
                <div className="relative flex items-center">
                  <span className="absolute left-4 text-slate-400">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4.5 w-4.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                    </svg>
                  </span>
                  <Controller
                    name="password"
                    control={control}
                    rules={{ required: "Password is required" }}
                    render={({ field }) => (
                      <input
                        {...field}
                        ref={(e) => {
                          field.ref(e);
                          passwordRef.current = e;
                        }}
                        disabled={loading}
                        type={isPasswordVisible ? "text" : "password"}
                        placeholder="••••••••"
                        className={`w-full pl-11 pr-11 py-3.5 bg-slate-50 border text-xs font-semibold rounded-2xl transition-all outline-hidden ${errors.password
                            ? 'border-red-300 focus:border-red-500 focus:bg-white focus:ring-4 focus:ring-red-100'
                            : 'border-slate-100 focus:border-indigo-500 focus:bg-white focus:ring-4 focus:ring-indigo-50/50'
                          }`}
                        onChange={(e) => {
                          const value = e.target.value.replace(/\s/g, "");
                          field.onChange(value);
                        }}
                      />
                    )}
                  />
                  <button
                    type="button"
                    onClick={togglePasswordVisibility}
                    className="absolute right-4 text-slate-400 hover:text-slate-600 cursor-pointer"
                  >
                    {isPasswordVisible ? (
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-4.5 w-4.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                      </svg>
                    ) : (
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-4.5 w-4.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.542-7a10.025 10.025 0 012.203-3.678m3.989-3.55A10.05 10.05 0 0112 5c4.478 0 8.268 2.943 9.542 7a10.025 10.025 0 01-2.201 3.679M12 9a3 3 0 110 6 3 3 0 010-6zm0 0v6" strokeDasharray="3 3" />
                      </svg>
                    )}
                  </button>
                </div>
              </div>
            )}

          </div>

          {/* Action button */}
          <div className="pt-2">
            <button
              type="submit"
              disabled={loading}
              className="w-full py-3.5 bg-indigo-600 text-white rounded-2xl font-bold text-xs uppercase tracking-wider shadow-lg shadow-indigo-150 hover:bg-indigo-700 hover:shadow-indigo-200 focus:ring-4 focus:ring-indigo-100 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 flex items-center justify-center space-x-2 cursor-pointer"
            >
              {loading ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  <span>Signing In...</span>
                </>
              ) : (
                <>
                  <span>Sign In</span>
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M11 16l4-4m0 0l-4-4m4 4H3" />
                  </svg>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default Login;
