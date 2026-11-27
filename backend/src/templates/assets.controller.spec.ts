import * as fs from 'node:fs';
import * as path from 'node:path';
import { NotFoundException } from '@nestjs/common';
import { AssetsController } from './assets.controller';

describe('AssetsController', () => {
  const controller = new AssetsController();
  const root = path.resolve(process.cwd(), 'assets');

  function fakeResponse() {
    return {
      setHeader: jest.fn(),
      send: jest.fn(),
    };
  }

  it('serves font files with the ttf content type', () => {
    const res = fakeResponse();
    const file = path.join(root, 'fonts/Lipstick-Rage.ttf');

    controller.get({ path: ['fonts', 'Lipstick-Rage.ttf'] }, res);

    expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'font/ttf');
    const sent = res.send.mock.calls[0][0] as Buffer;
    expect(sent.subarray(0, 4)).toEqual(fs.readFileSync(file).subarray(0, 4));
  });

  it('serves template images with the png content type', () => {
    const res = fakeResponse();
    const relative = 'templates/garrison-cat-badge/garrison-cat-badge-frame.png';

    controller.get({ path: relative.split('/') }, res);

    expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'image/png');
    const sent = res.send.mock.calls[0][0] as Buffer;
    expect(sent).toEqual(fs.readFileSync(path.join(root, relative)));
  });

  it('rejects paths outside the assets directory', () => {
    expect(() =>
      controller.get({ path: ['..', 'package.json'] }, fakeResponse()),
    ).toThrow(NotFoundException);
  });

  it('rejects directories', () => {
    expect(() =>
      controller.get({ path: ['templates', 'garrison-cat-badge'] }, fakeResponse()),
    ).toThrow(NotFoundException);
  });
});
