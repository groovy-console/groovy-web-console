/*
 * Copyright 2015-2021 the original author or authors.
 *
 * All rights reserved. This program and the accompanying materials are
 * made available under the terms of the Eclipse Public License v2.0 which
 * accompanies this distribution and is available at
 *
 * https://www.eclipse.org/legal/epl-v20.html
 */

package gwc.spock.output;

import java.util.Locale;

import org.junit.platform.engine.TestExecutionResult;
import org.junit.platform.launcher.TestIdentifier;

/**
 * @since 1.0
 */
enum Color {

	NONE,

	BLACK,

	RED,

	GREEN,

	YELLOW,

	BLUE,

	PURPLE,

	CYAN,

	WHITE;

	static Color valueOf(TestExecutionResult result) {
		switch (result.getStatus()) {
			case SUCCESSFUL:
				return Color.SUCCESSFUL;
			case ABORTED:
				return Color.ABORTED;
			case FAILED:
				return Color.FAILED;
			default:
				return Color.NONE;
		}
	}

	static Color valueOf(TestIdentifier testIdentifier) {
		return testIdentifier.isContainer() ? CONTAINER : TEST;
	}

	static final Color SUCCESSFUL = GREEN;

	static final Color ABORTED = YELLOW;

	static final Color FAILED = RED;

	static final Color SKIPPED = PURPLE;

	static final Color CONTAINER = CYAN;

	static final Color TEST = BLUE;

	static final Color DYNAMIC = PURPLE;

	static final Color REPORTED = WHITE;

	@Override
	public String toString() {
		return name().toLowerCase(Locale.ROOT);
	}

}
