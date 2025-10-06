
import Phaser from 'phaser';
import { GameScene } from './scenes/GameScene';

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  parent: 'app',
  backgroundColor: '#0b0f12',
  scale: { mode: Phaser.Scale.RESIZE },
  scene: [GameScene],
  render: { pixelArt: true },
};

new Phaser.Game(config);
