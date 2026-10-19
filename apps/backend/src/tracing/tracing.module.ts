import { Global, Module, NestModule, MiddlewareConsumer } from '@nestjs/common';
import { TracerService } from './tracer.service';
import { TracingMiddleware } from './tracing.middleware';

@Global()
@Module({
  providers: [TracerService, TracingMiddleware],
  exports: [TracerService, TracingMiddleware],
})
export class TracingModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    // Tracing middleware is applied in AppModule before/alongside request ID
  }
}
