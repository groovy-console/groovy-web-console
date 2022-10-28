package gwc;

import com.google.cloud.functions.HttpRequest;
import com.google.cloud.functions.HttpResponse;
import com.google.gson.Gson;
import gwc.representations.compileserver.TestRequest;
import gwc.spock.ScriptRunner;

import java.io.IOException;

public class CompilerServerApi {
  private static final Gson GSON = new Gson();

  static void handleCompileRequest(HttpRequest request, HttpResponse response) {
    try {
      var path = request.getPath();
      if (path.equals("/api/compiler/run")) {
        handleRunRequest(request, response);
      } else if (path.equals("/api/compiler/test")) {
        handleTestRequest(request, response);
      } else {
        response.setStatusCode(501);
      }
    } catch (IOException e) {
      throw new RuntimeException(e);
    }
  }

  private static void handleTestRequest(HttpRequest request, HttpResponse response) throws IOException {
    TestRequest testRequest = GSON.fromJson(request.getReader(), TestRequest.class);
    new ScriptRunner().run(testRequest.getFiles());
  }

  private static void handleRunRequest(HttpRequest request, HttpResponse response) {
    response.setStatusCode(501);
  }

}
