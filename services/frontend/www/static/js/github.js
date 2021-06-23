export async function loadGist(gistId) {
    if (gistId.indexOf("/") >= 0) {
        gistId = gistId.split("/")[1]
    }

    const headers = new Headers();
    headers.append("Accept", "application/vnd.github.v3+json");
    const response = await fetch(`https://api.github.com/gists/${gistId}`, {
        headers
    });
    const json = await response.json()
    for (const [key, value] of Object.entries(json.files)) {
        console.log("Found file", key, value);
        if(value.truncated === false && value.language === 'Groovy') {
            return value.content;
        }
    }
    throw new Error("Could not find a non-truncated groovy script");
}
