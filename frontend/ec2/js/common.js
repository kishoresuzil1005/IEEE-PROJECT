// frontend/ec2/js/common.js

// Removed Amplify configuration as authentication is no longer used

async function callApi(url, options = {}) {
    try {
        // No authentication headers needed
        const headers = {
            'Content-Type': 'application/json',
            ...(options.headers || {}) // Merge with any existing headers
        };

        const fetchOptions = {
            ...options,
            headers: headers
        };

        const response = await fetch(url, fetchOptions);

        if (!response.ok) {
            let errorData;
            try {
                errorData = await response.json();
            } catch (jsonError) {
                errorData = { message: `HTTP error! status: ${response.status} - ${response.statusText}` };
            }
            throw new Error(errorData.error || errorData.message || `API call failed with status: ${response.status}`);
        }

        const contentType = response.headers.get("content-type");
        if (contentType && contentType.includes("application/json")) {
            return await response.json();
        } else {
            const textResponse = await response.text();
            return textResponse ? { message: textResponse } : { message: "Action successful, no content returned." };
        }
    } catch (error) {
        console.error("API Call Error:", error);
        throw error; // Re-throw to be handled by the specific page's catch block
    }
}

