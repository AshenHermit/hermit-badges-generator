import 'reflect-metadata';
import * as fs from 'fs';
import * as path from 'path';
import { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';
import { AppModule } from '../app.module';
import { GenerationService } from './generation.service';

const GOLDEN_PATH = path.resolve(process.cwd(), 'test/golden/hermit-frame.png');

describe('golden PNG', () => {
  let moduleRef: TestingModule;
  let service: GenerationService;

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    await moduleRef.init();
    service = moduleRef.get(GenerationService);
  });

  afterAll(async () => {
    await moduleRef.close();
  });

  // The committed golden PNG is current for the template render plus the sharp
  // resize to the default 60px: left=Hello&right=World with all color defaults.
  it('matches the committed hermit-frame PNG byte for byte', async () => {
    const { image } = await service.generate({
      template: 'hermit-frame',
      left: 'Hello',
      right: 'World',
    });
    const expected = fs.readFileSync(GOLDEN_PATH);

    if (process.env.REGENERATE_GOLDEN === '1') {
      fs.writeFileSync(GOLDEN_PATH, image);
      console.log(`golden regenerated: ${image.length} bytes`);
    }
    expect(image.equals(expected)).toBe(true);
  }, 30000);
});
