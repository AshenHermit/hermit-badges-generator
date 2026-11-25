import { INestApplication, ValidationPipe } from '@nestjs/common';
import { SwaggerModule } from '@nestjs/swagger';

export function configureApp(app: INestApplication): void {
  app.setGlobalPrefix('api');

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );

  SwaggerModule.setup(
    'docs',
    app,
    () =>
      SwaggerModule.createDocument(app, {
        openapi: '3.0.3',
        info: { title: 'badge-generator', version: '1.0.0' },
      }),
    {
      useGlobalPrefix: true,
      jsonDocumentUrl: 'docs/json',
    },
  );
}
