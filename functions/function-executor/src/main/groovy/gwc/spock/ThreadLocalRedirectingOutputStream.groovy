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

class ThreadLocalRedirectingOutputStream extends OutputStream {
  OutputStream original
  ThreadLocal<OutputStream> redirect

  void write(int b) {
    (redirect.get() ?: original).write(b)
  }

  void write(byte[] b) {
    (redirect.get() ?: original).write(b)
  }

  void write(byte[] b, int off, int len) {
    (redirect.get() ?: original).write(b, off, len)
  }

  void flush() {
    (redirect.get() ?: original).flush()
  }

  void close() {
    (redirect.get() ?: original).close()
  }
}
