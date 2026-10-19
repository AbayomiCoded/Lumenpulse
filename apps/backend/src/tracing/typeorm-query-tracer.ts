import { Logger as TypeOrmLogger } from 'typeorm';
import { TracerService } from './tracer.service';

/**
 * Custom TypeORM logger that emits `db.query` spans attached to the active trace context.
 */
export class TypeOrmQueryTracer implements TypeOrmLogger {
  constructor(private readonly tracer: TracerService) {}

  logQuery(query: string, parameters?: unknown[]): void {
    const span = this.tracer.startSpan('db.query', {
      kind: 'CLIENT',
      attributes: {
        'db.system': 'postgresql',
        'db.statement': query,
        'db.params_count': parameters ? parameters.length : 0,
      },
    });
    span.end();
  }

  logQueryError(
    error: string | Error,
    query: string,
    parameters?: unknown[],
  ): void {
    const span = this.tracer.startSpan('db.query', {
      kind: 'CLIENT',
      attributes: {
        'db.system': 'postgresql',
        'db.statement': query,
        'db.params_count': parameters ? parameters.length : 0,
      },
    });
    span.recordException(error);
    span.end();
  }

  logQuerySlow(time: number, query: string, parameters?: unknown[]): void {
    const span = this.tracer.startSpan('db.query.slow', {
      kind: 'CLIENT',
      attributes: {
        'db.system': 'postgresql',
        'db.statement': query,
        'db.duration_ms': time,
      },
    });
    span.end();
  }

  logSchemaBuild(message: string): void {
    // schema build log
  }

  logMigration(message: string): void {
    // migration log
  }

  log(level: 'log' | 'info' | 'warn', message: unknown): void {
    // general log
  }
}
