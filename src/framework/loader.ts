import { GroupRecorder } from './logger.js';
import { IParamsAny, paramsEquals, paramsSupersets } from './params/index.js';
import { RunCaseIterable, TestCaseID, RunCase } from './test_group.js';
import { allowedTestNameCharacters } from './allowed_characters.js';

export interface TestGroupDesc {
  readonly path: string;
  readonly description: string;
}

export interface TestSuiteListing {
  readonly suite: string;
  readonly groups: Iterable<TestGroupDesc>;
}

export interface TestSpecFile {
  readonly description: string;
  // undefined for README.txt, defined for a test module.
  readonly g?: RunCaseIterable;
}

export interface TestQueryResult {
  // a suite, e.g. "cts".
  readonly suite: string;
  // a path within a suite, e.g. "command_buffer/compute/basic".
  readonly path: string;
  readonly node: Promise<TestSpecFile>;
}

type TestQueryResults = IterableIterator<TestQueryResult>;

function* concat(lists: TestQueryResult[][]): TestQueryResults {
  for (const nodes of lists) {
    for (const node of nodes) {
      yield node;
    }
  }
}

type TestGroupFilter = (testcase: TestCaseID) => boolean;
function filterTestGroup(group: RunCaseIterable, filter: TestGroupFilter): RunCaseIterable {
  return {
    *iterate(log: GroupRecorder): Iterable<RunCase> {
      for (const rc of group.iterate(log)) {
        if (filter(rc.id)) {
          yield rc;
        }
      }
    },
  };
}

export class TestLoader {
  async loadTestsFromQuery(query: string): Promise<IterableIterator<TestQueryResult>> {
    return this.loadTests(new URLSearchParams(query).getAll('q'));
  }

  async loadTestsFromCmdLine(filters: string[]): Promise<IterableIterator<TestQueryResult>> {
    // In actual URL queries (?q=...), + represents a space. But decodeURIComponent doesn't do this,
    // so do it manually. (+ is used over %20 for readability.) (See also encodeSelectively.)
    return this.loadTests(filters.map(f => decodeURIComponent(f.replace(/\+/g, '%20'))));
  }

  async loadTests(filters: string[]): Promise<IterableIterator<TestQueryResult>> {
    const loads = filters.map(f => this.loadFilter(f));
    return concat(await Promise.all(loads));
  }

  protected async listing(suite: string): Promise<TestSuiteListing> {
    return { suite, groups: await (await import(`../suites/${suite}/index.js`)).listing };
  }

  protected import(path: string): Promise<TestSpecFile> {
    return import('../suites/' + path);
  }

  // Each filter is of one of the forms below (urlencoded).
  private async loadFilter(filter: string): Promise<TestQueryResult[]> {
    const i1 = filter.indexOf(':');
    if (i1 === -1) {
      // - cts
      return this.filterByGroup(await this.listing(filter), '');
    }

    const suite = filter.substring(0, i1);
    const i2 = filter.indexOf(':', i1 + 1);
    if (i2 === -1) {
      // - cts:
      // - cts:buf
      // - cts:buffers/
      // - cts:buffers/map
      const groupPrefix = filter.substring(i1 + 1);
      return this.filterByGroup(await this.listing(suite), groupPrefix);
    }

    const group = filter.substring(i1 + 1, i2);
    const endOfTestName = new RegExp('[^' + allowedTestNameCharacters + ']');
    const i3sub = filter.substring(i2 + 1).search(endOfTestName);
    if (i3sub === -1) {
      // - cts:buffers/mapWriteAsync:
      // - cts:buffers/mapWriteAsync:ba
      const testPrefix = filter.substring(i2 + 1);
      return [
        {
          suite,
          path: group,
          node: this.filterByTestMatch(suite, group, testPrefix),
        },
      ];
    }

    const i3 = i2 + 1 + i3sub;
    const test = filter.substring(i2 + 1, i3);
    const token = filter.charAt(i3);

    let params = null;
    if (i3 + 1 < filter.length) {
      params = JSON.parse(filter.substring(i3 + 1)) as IParamsAny;
    }

    if (token === '~') {
      // - cts:buffers/mapWriteAsync:basic~
      // - cts:buffers/mapWriteAsync:basic~{}
      // - cts:buffers/mapWriteAsync:basic~{filter:"params"}
      return [
        {
          suite,
          path: group,
          node: this.filterByParamsMatch(suite, group, test, params),
        },
      ];
    } else if (token === ':') {
      // - cts:buffers/mapWriteAsync:basic:
      // - cts:buffers/mapWriteAsync:basic:{}
      // - cts:buffers/mapWriteAsync:basic:{exact:"params"}
      return [
        {
          suite,
          path: group,
          node: this.filterByParamsExact(suite, group, test, params),
        },
      ];
    } else {
      throw new Error("invalid character after test name; must be '~' or ':'");
    }
  }

  private filterByGroup(
    { suite, groups }: TestSuiteListing,
    groupPrefix: string
  ): TestQueryResult[] {
    const entries: TestQueryResult[] = [];

    for (const { path, description } of groups) {
      if (path.startsWith(groupPrefix)) {
        const isReadme = path === '' || path.endsWith('/');
        const node: Promise<TestSpecFile> = isReadme
          ? Promise.resolve({ description })
          : this.import(`${suite}/${path}.spec.js`);
        entries.push({ suite, path, node });
      }
    }

    return entries;
  }

  private async filterByTestMatch(
    suite: string,
    group: string,
    testPrefix: string
  ): Promise<TestSpecFile> {
    const node = (await this.import(`${suite}/${group}.spec.js`)) as TestSpecFile;
    if (!node.g) {
      return node;
    }
    return {
      description: node.description,
      g: filterTestGroup(node.g, testcase => testcase.name.startsWith(testPrefix)),
    };
  }

  private async filterByParamsMatch(
    suite: string,
    group: string,
    test: string,
    paramsMatch: IParamsAny | null
  ): Promise<TestSpecFile> {
    const node = (await this.import(`${suite}/${group}.spec.js`)) as TestSpecFile;
    if (!node.g) {
      return node;
    }
    return {
      description: node.description,
      g: filterTestGroup(
        node.g,
        testcase => testcase.name === test && paramsSupersets(testcase.params, paramsMatch)
      ),
    };
  }

  private async filterByParamsExact(
    suite: string,
    group: string,
    test: string,
    paramsExact: IParamsAny | null
  ): Promise<TestSpecFile> {
    const node = (await this.import(`${suite}/${group}.spec.js`)) as TestSpecFile;
    if (!node.g) {
      return node;
    }
    return {
      description: node.description,
      g: filterTestGroup(
        node.g,
        testcase => testcase.name === test && paramsEquals(testcase.params, paramsExact)
      ),
    };
  }
}