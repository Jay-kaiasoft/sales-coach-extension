import Cookies from "js-cookie";
import { siteURL } from "../config/config";

const getDomainAndUrl = () => {
  let url = siteURL || "https://devwebapp.360pipe.com";
  
  if (typeof document !== "undefined" && document.referrer) {
    url = document.referrer;
  } else if (typeof window !== "undefined") {
    url = window.location.href;
  }

  try {
    const parsed = new URL(url);
    if (parsed.protocol === "chrome-extension:") {
      const fallbackUrl = siteURL || "https://devwebapp.360pipe.com";
      const fallbackParsed = new URL(fallbackUrl);
      return { url: fallbackUrl, domain: fallbackParsed.hostname };
    }
    return { url: parsed.origin, domain: parsed.hostname };
  } catch (e) {
    return { url: "https://devwebapp.360pipe.com", domain: "devwebapp.360pipe.com" };
  }
};

export const getCookie = (name) => {
  return new Promise((resolve) => {
    if (typeof chrome !== "undefined" && chrome.cookies) {
      const { url } = getDomainAndUrl();
      chrome.cookies.get({ url, name }, (cookie) => {
        resolve(cookie ? cookie.value : null);
      });
    } else {
      resolve(Cookies.get(name) || null);
    }
  });
};

export const setCookie = (name, value, days = 1) => {
  return new Promise((resolve) => {
    if (typeof chrome !== "undefined" && chrome.cookies) {
      const { url, domain } = getDomainAndUrl();
      const expirationDate = Math.round(Date.now() / 1000) + (days * 24 * 60 * 60);
      chrome.cookies.set(
        {
          url,
          name,
          value,
          expirationDate,
          path: "/"
        },
        (cookie) => {
          resolve(!!cookie);
        }
      );
    } else {
      Cookies.set(name, value, { expires: days });
      resolve(true);
    }
  });
};

export const removeCookie = (name) => {
  return new Promise((resolve) => {
    if (typeof chrome !== "undefined" && chrome.cookies) {
      const { url } = getDomainAndUrl();
      chrome.cookies.remove({ url, name }, (result) => {
        resolve(!!result);
      });
    } else {
      Cookies.remove(name);
      resolve(true);
    }
  });
};
