import { BuildContext, WorkerProcess, WorkerMessage } from './util/interfaces';
import { BuildError, Logger } from './util/logger';
import { fork, ChildProcess } from 'child_process';
import { join } from 'path';
import { emit, EventType } from './util/events';


export function runWorker(taskModule: string, taskWorker: string, context: BuildContext, workerConfig: any) {
  return new Promise((resolve, reject) => {
    const worker = <ChildProcess>createWorker(taskModule);
    const msg: WorkerMessage = {
      taskModule,
      taskWorker,
      context: {
        // only copy over what's important
        // don't copy over the large data properties
        rootDir: context.rootDir,
        tmpDir: context.tmpDir,
        srcDir: context.srcDir,
        wwwDir: context.wwwDir,
        wwwIndex: context.wwwIndex,
        buildDir: context.buildDir,
        isProd: context.isProd,
        isWatch: context.isWatch,
        bundler: context.bundler,
        inlineTemplates: context.inlineTemplates,
      },
      workerConfig
    };

    worker.on('message', (msg: WorkerMessage) => {
      if (msg.error) {
        const buildErrorError = new BuildError(msg.error);
        if (buildErrorError.updatedDiagnostics) {
          emit(EventType.UpdatedDiagnostics);
        }
        reject(buildErrorError);

      } else if (msg.reject) {
        const buildErrorReject = new BuildError(msg.reject);
        if (buildErrorReject.updatedDiagnostics) {
          emit(EventType.UpdatedDiagnostics);
        }
        reject(buildErrorReject);

      } else {
        resolve(msg.resolve);
      }

      killWorker(msg.pid);
    });

    worker.on('error', (err: any) => {
      Logger.error(`worker error, taskModule: ${taskModule}, pid: ${worker.pid}, error: ${err}`);
    });

    worker.on('exit', (code: number) => {
      Logger.debug(`worker exited, taskModule: ${taskModule}, pid: ${worker.pid}`);
    });

    worker.send(msg);
  });
}


function killWorker(pid: number) {
  for (var i = workers.length - 1; i >= 0; i--) {
    if (workers[i].worker.pid === pid) {
      try {
        workers[i].worker.kill('SIGKILL');
      } catch (e) {
        Logger.error(`killWorker, ${pid}: ${e}`);
      } finally {
        delete workers[i].worker;
        workers.splice(i, 1);
      }
    }
  }
}


export function createWorker(taskModule: string): any {
  for (var i = workers.length - 1; i >= 0; i--) {
    if (workers[i].task === taskModule) {
      try {
        workers[i].worker.kill('SIGKILL');
      } catch (e) {
        Logger.debug(`createWorker, ${taskModule} kill('SIGKILL'): ${e}`);
      } finally {
        delete workers[i].worker;
        workers.splice(i, 1);
      }
    }
  }

  try {
    const workerModule = join(__dirname, 'worker-process.js');
    const worker = fork(workerModule, [], {
      env: {
        FORCE_COLOR: true
      }
    });

    Logger.debug(`worker created, taskModule: ${taskModule}, pid: ${worker.pid}`);

    workers.push({
      task: taskModule,
      worker: worker
    });

    return worker;

  } catch (e) {
    throw new BuildError(`unable to create worker-process, task: ${taskModule}: ${e}`);
  }
}


export const workers: WorkerProcess[] = [];
