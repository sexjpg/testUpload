// githubFileUpdater.js

/**
 * @async
 * @function updateGitHubFile
 * @description Triggers a GitHub Action to update a file in a repository.
 * @param {object} options - The options for updating the file.
 * @param {string} options.owner - The owner of the GitHub repository.
 * @param {string} options.repo - The name of the GitHub repository.
 * @param {string} options.filePath - The full path to the file in the repository (e.g., 'data/myFile.txt').
 * @param {string} options.fileContent - The content to write to the file.
 * @param {string} options.pat - The Personal Access Token (PAT) for authenticating the API request to trigger the dispatch.
 *                                This PAT needs permission to dispatch repository events. For public repos,
 *                                a PAT with no special scopes might work, or 'public_repo'. For private repos, 'repo' scope is needed.
 * @param {string} [options.eventType='update-file-event'] - The event_type for the repository_dispatch. Must match the workflow trigger.
 * @param {function} [options.onStatusUpdate] - Optional callback function to receive status updates.
 *                                              Receives an object like { status: 'sending' | 'success' | 'error', message: string, httpStatus?: number }.
 * @returns {Promise<object>} A promise that resolves with an object indicating success or failure.
 *                            { success: true, message: string, httpStatus: number } or
 *                            { success: false, message: string, errorDetails?: any, httpStatus?: number }
 */
async function updateGitHubFile(options) {
    const {
        owner,
        repo,
        filePath,
        fileContent,
        pat,
        eventType = 'update-file-event', // Default event type
        onStatusUpdate
    } = options;

    // --- Input Validation ---
    if (!owner || !repo || !filePath || typeof fileContent !== 'string') {
        const errorMsg = 'Error: Missing required parameters (owner, repo, filePath, fileContent).';
        if (onStatusUpdate) onStatusUpdate({ status: 'error', message: errorMsg });
        return { success: false, message: errorMsg };
    }
    // PAT is highly recommended, even for public repos, to avoid rate limits / ensure dispatch
    if (!pat) {
        const warnMsg = 'Warning: PAT is not provided. API request might fail or be rate-limited, especially for private repositories or frequent use.';
        if (onStatusUpdate) onStatusUpdate({ status: 'warning', message: warnMsg });
        // Depending on strictness, you might choose to return an error here:
        // return { success: false, message: "Error: PAT is required." };
    }


    if (onStatusUpdate) onStatusUpdate({ status: 'sending', message: 'Preparing data...' });

    // --- Base64 Encode Content ---
    let base64Content;
    try {
        const encoder = new TextEncoder(); // For UTF-8 handling
        const data = encoder.encode(fileContent);
        base64Content = btoa(String.fromCharCode.apply(null, data));
    } catch (e) {
        const errorMsg = `Error encoding file content: ${e.message}`;
        if (onStatusUpdate) onStatusUpdate({ status: 'error', message: errorMsg });
        return { success: false, message: errorMsg, errorDetails: e };
    }

    // --- API Call ---
    const apiUrl = `https://api.github.com/repos/${owner}/${repo}/dispatches`;
    const headers = {
        'Accept': 'application/vnd.github.v3+json',
        'Content-Type': 'application/json',
        // 'X-GitHub-Api-Version': '2022-11-28' // Good practice
    };

    if (pat) {
        headers['Authorization'] = `Bearer ${pat}`;
    }

    const body = JSON.stringify({
        event_type: eventType,
        client_payload: {
            filename: filePath,
            content_base64: base64Content
        }
    });

    if (onStatusUpdate) onStatusUpdate({ status: 'sending', message: `Sending request to ${apiUrl}...` });

    try {
        const response = await fetch(apiUrl, {
            method: 'POST',
            headers: headers,
            body: body
        });

        if (response.ok) { // status 204 No Content is typical for successful dispatch
            const successMsg = `Success! Dispatch event sent. Status: ${response.status}. Check Actions tab in '${owner}/${repo}'.`;
            if (onStatusUpdate) onStatusUpdate({ status: 'success', message: successMsg, httpStatus: response.status });
            return { success: true, message: successMsg, httpStatus: response.status };
        } else {
            let errorData = { message: `Request failed with status: ${response.status}` };
            try {
                errorData = await response.json(); // Try to parse GitHub's error response
            } catch (e) {
                // Ignore if response is not JSON
            }
            const errorMsg = `Error: ${response.status} - ${errorData.message || response.statusText}`;
            if (onStatusUpdate) onStatusUpdate({ status: 'error', message: errorMsg, errorDetails: errorData, httpStatus: response.status });
            return { success: false, message: errorMsg, errorDetails: errorData, httpStatus: response.status };
        }
    } catch (error) {
        const errorMsg = `Network or fetch error: ${error.message}`;
        if (onStatusUpdate) onStatusUpdate({ status: 'error', message: errorMsg, errorDetails: error });
        return { success: false, message: errorMsg, errorDetails: error };
    }
}

// If you want to use it as an ES module (e.g. with bundlers or <script type="module">)
// export { updateGitHubFile };