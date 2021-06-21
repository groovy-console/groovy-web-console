package gwc.remote


import java.net.http.*

import groovy.json.JsonSlurper

class GistSource implements RemoteSource {
  private final HttpClient httpClient
  private final URI baseUrl

  GistSource(HttpClient httpClient) {
    this.httpClient = httpClient
    this.baseUrl = URI.create('https://gist.github.com/')
  }

  GistSource(HttpClient httpClient, URI baseUrl) {
    this.httpClient = httpClient
    this.baseUrl = baseUrl
  }

  @Override
  boolean supports(String scheme) {
    return 'gist' == scheme
  }

  @Override
  String loadSource(URI source) {
    try {
      return findGroovyContent(getGistInfo(source))
    } catch (IOException | InterruptedException e) {
      throw new RemoteSourceException('Could not download remote source' + source, e)
    }
  }

  private String findGroovyContent(String gistInfo) {
    def gistResponse = new JsonSlurper().parseText(gistInfo)
    // https://docs.github.com/en/rest/reference/gists#truncation
    // The Gist API provides up to one megabyte of content for each file in the gist.
    // Each file returned for a gist through the API has a key called truncated.
    // If truncated is true, the file is too large and only a portion of the contents were returned in content.

    // As 1mb is plenty of content for a script, we limit the support to non-truncated files
    return gistResponse.files.values().find { it.language == "Groovy" && it.truncated == false }?.content
  }

  private String getGistInfo(URI source) throws IOException, InterruptedException {
    HttpRequest request = HttpRequest.newBuilder()
        .uri(toGistUri(source))
        .GET()
        .build()
    return httpClient.send(request, HttpResponse.BodyHandlers.ofString()).body()
  }

  URI toGistUri(URI source) {
    String path = source.path
    if (path == null || path.blank) {
      throw new RemoteSourceException('Path component is blank for: ' + source)
    }

    String[] split = path.substring(1).split('/')
    if (split.length > 2) {
      throw new RemoteSourceException('Invalid gist-url format: ' + source)
    }
    String id = split[split.length - 1]
    return baseUrl.resolve('/gists/' + id)
  }
}
