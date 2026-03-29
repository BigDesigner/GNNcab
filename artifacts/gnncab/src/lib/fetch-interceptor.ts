// Intercept fetch calls to inject JWT token and handle 401s
const originalFetch = window.fetch;

window.fetch = async (resource: RequestInfo | URL, config?: RequestInit) => {
  const token = localStorage.getItem("gnncab_token");
  
  if (token) {
    config = config || {};
    config.headers = {
      ...config.headers,
      Authorization: `Bearer ${token}`,
    };
  }

  try {
    const response = await originalFetch(resource, config);
    if (response.status === 401) {
      localStorage.removeItem("gnncab_token");
      localStorage.removeItem("gnncab_user");
      // Prevent redirect loop if already on login
      if (window.location.pathname !== "/login") {
        window.location.href = "/login";
      }
    }
    return response;
  } catch (error) {
    throw error;
  }
};
