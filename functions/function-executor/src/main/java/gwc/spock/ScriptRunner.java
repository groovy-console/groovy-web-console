/*
 * Copyright 2009 the original author or authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

package gwc.spock;

import org.spockframework.runtime.*;

import java.io.*;
import java.lang.reflect.Modifier;
import java.util.List;
import java.util.stream.Collectors;

import gwc.spock.output.*;
import org.intellij.lang.annotations.Language;
import org.junit.platform.engine.discovery.*;
import org.junit.platform.launcher.*;
import org.junit.platform.launcher.core.*;

/**
 * Runs a script containing one or more Spock specifications.
 */

@SuppressWarnings({"rawtypes"})
public class ScriptRunner {

  private boolean disableColors = false;

  // import is added via ImportCustomizer in ScriptCompiler
  public String run(@Language(value = "Groovy", suffix = "\nimport spock.lang.*") String scriptText) {
    ScriptCompiler compiler = new ScriptCompiler();
    List<Class> classes = compiler.compile(scriptText);
    List<Class> testClasses = findTestClasses(classes);
    if (testClasses.isEmpty()) { return "No runnable specifications found"; }
    ClassSelector[] selectors = testClasses.stream().map(DiscoverySelectors::selectClass).toArray(ClassSelector[]::new);

    LauncherDiscoveryRequest discoveryRequest = LauncherDiscoveryRequestBuilder
        .request()
        .selectors(selectors)
        .filters(EngineFilter.includeEngines("spock"))
        .build();

    StringWriter stringWriter = new StringWriter();
    try (PrintWriter pw = new PrintWriter(stringWriter)) {

      TreePrintingListener listener = new TreePrintingListener(pw, disableColors, Theme.UNICODE);

      LauncherFactory.create()
          .execute(discoveryRequest, listener);

    }

    return stringWriter.toString();
  }

  private List<Class> findTestClasses(List<Class> classes) {
    return classes.stream()
        .filter(clazz -> SpecUtil.isSpec(clazz) && !Modifier.isAbstract(clazz.getModifiers()))
        .collect(Collectors.toList());
  }

  public void setDisableColors(boolean disableColors) {
    this.disableColors = disableColors;
  }
}
