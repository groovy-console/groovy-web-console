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

package gwc.spock

class ScriptOutput {
  private static redirect = new ThreadLocal()

  static {
    ThreadLocalRedirectingOutputStream out = new ThreadLocalRedirectingOutputStream(original: System.out, redirect: redirect)
    ThreadLocalRedirectingOutputStream err = new ThreadLocalRedirectingOutputStream(original: System.err, redirect: redirect)
    System.setOut(new PrintStream(out, true, 'utf-8'))
    System.setErr(new PrintStream(err, true, 'utf-8'))
  }

  static void redirectTo(stream, block) {
    redirect.set(stream)
    try {
      block()
    } finally {
      redirect.remove()
    }
  }
}
