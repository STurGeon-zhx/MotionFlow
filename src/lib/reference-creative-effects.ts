import type {EffectPreset} from './schema';

export const referenceCreativeEffects: EffectPreset[] = [
  {
    "id": "reference_brush_comet",
    "name": "笔刷彗尾显影",
    "type": "combo",
    "category": "reference_creative",
    "description": "粗糙笔触逐行擦出画面，斜置卡片沿彗尾推进",
    "durationFrames": 48,
    "atoms": [
      {
        "type": "visualProgress",
        "from": 0,
        "to": 1,
        "startFrame": 0,
        "endFrame": 48,
        "easing": "linear"
      }
    ],
    "visual": "brushComet",
    "enabled": true
  },
  {
    "id": "reference_ink_bloom_paper",
    "name": "宣纸墨团晕开",
    "type": "combo",
    "category": "reference_creative",
    "description": "四处墨团在宣纸上扩散融合，墨色逐渐恢复原色",
    "durationFrames": 48,
    "atoms": [
      {
        "type": "visualProgress",
        "from": 0,
        "to": 1,
        "startFrame": 0,
        "endFrame": 48,
        "easing": "linear"
      }
    ],
    "visual": "inkBloomPaper",
    "enabled": true
  },
  {
    "id": "reference_charcoal_rubbing",
    "name": "炭笔拓印",
    "type": "combo",
    "category": "reference_creative",
    "description": "交错铅笔短线拓出黑白图像，随后冲洗为彩色",
    "durationFrames": 48,
    "atoms": [
      {
        "type": "visualProgress",
        "from": 0,
        "to": 1,
        "startFrame": 0,
        "endFrame": 48,
        "easing": "linear"
      }
    ],
    "visual": "charcoalRubbing",
    "enabled": true
  },
  {
    "id": "reference_watercolor_pools",
    "name": "水彩汇流",
    "type": "combo",
    "category": "reference_creative",
    "description": "柔边水彩池从不同位置汇合，保留晕染纸张质感",
    "durationFrames": 48,
    "atoms": [
      {
        "type": "visualProgress",
        "from": 0,
        "to": 1,
        "startFrame": 0,
        "endFrame": 48,
        "easing": "linear"
      }
    ],
    "visual": "watercolorPools",
    "enabled": true
  },
  {
    "id": "reference_paint_roller_reveal",
    "name": "滚筒铺画",
    "type": "combo",
    "category": "reference_creative",
    "description": "立体滚筒向前滚动，把完整画面铺到纸面",
    "durationFrames": 48,
    "atoms": [
      {
        "type": "visualProgress",
        "from": 0,
        "to": 1,
        "startFrame": 0,
        "endFrame": 48,
        "easing": "linear"
      }
    ],
    "visual": "paintRollerReveal",
    "enabled": true
  },
  {
    "id": "reference_paper_window_cut",
    "name": "裁纸开窗",
    "type": "combo",
    "category": "reference_creative",
    "description": "旋斜纸面上的方形窗口扩大，纸边逐渐退出",
    "durationFrames": 48,
    "atoms": [
      {
        "type": "visualProgress",
        "from": 0,
        "to": 1,
        "startFrame": 0,
        "endFrame": 48,
        "easing": "linear"
      }
    ],
    "visual": "paperWindowCut",
    "enabled": true
  },
  {
    "id": "reference_polaroid_swing",
    "name": "悬摆拍立得",
    "type": "combo",
    "category": "reference_creative",
    "description": "白边照片围绕顶部悬点轻摆，带散景向前展开",
    "durationFrames": 48,
    "atoms": [
      {
        "type": "visualProgress",
        "from": 0,
        "to": 1,
        "startFrame": 0,
        "endFrame": 48,
        "easing": "linear"
      }
    ],
    "visual": "polaroidSwing",
    "enabled": true
  },
  {
    "id": "reference_gallery_rail",
    "name": "画廊轨道",
    "type": "combo",
    "category": "reference_creative",
    "description": "侧边画框沿景深轨道退开，主相框平移占满画布",
    "durationFrames": 48,
    "atoms": [
      {
        "type": "visualProgress",
        "from": 0,
        "to": 1,
        "startFrame": 0,
        "endFrame": 48,
        "easing": "linear"
      }
    ],
    "visual": "galleryRail",
    "enabled": true
  },
  {
    "id": "reference_matte_depth",
    "name": "套框景深",
    "type": "combo",
    "category": "reference_creative",
    "description": "多层彩色卡纸错位拉开，中心照片向前穿出",
    "durationFrames": 48,
    "atoms": [
      {
        "type": "visualProgress",
        "from": 0,
        "to": 1,
        "startFrame": 0,
        "endFrame": 48,
        "easing": "linear"
      }
    ],
    "visual": "matteDepth",
    "enabled": true
  },
  {
    "id": "reference_album_book",
    "name": "相册开卷",
    "type": "combo",
    "category": "reference_creative",
    "description": "相册封面沿书脊掀开，内页照片顺势铺满",
    "durationFrames": 48,
    "atoms": [
      {
        "type": "visualProgress",
        "from": 0,
        "to": 1,
        "startFrame": 0,
        "endFrame": 48,
        "easing": "linear"
      }
    ],
    "visual": "albumBook",
    "enabled": true
  },
  {
    "id": "reference_hanging_clips",
    "name": "木夹悬照",
    "type": "combo",
    "category": "reference_creative",
    "description": "双木夹夹住照片落入晾晒绳，轻摆后靠近镜头",
    "durationFrames": 48,
    "atoms": [
      {
        "type": "visualProgress",
        "from": 0,
        "to": 1,
        "startFrame": 0,
        "endFrame": 48,
        "easing": "linear"
      }
    ],
    "visual": "hangingClips",
    "enabled": true
  },
  {
    "id": "reference_magnifier_focus",
    "name": "放大镜巡焦",
    "type": "combo",
    "category": "reference_creative",
    "description": "清晰镜片巡过虚焦画面，最后扩大恢复全图",
    "durationFrames": 48,
    "atoms": [
      {
        "type": "visualProgress",
        "from": 0,
        "to": 1,
        "startFrame": 0,
        "endFrame": 48,
        "easing": "linear"
      }
    ],
    "visual": "magnifierFocus",
    "enabled": true
  },
  {
    "id": "reference_envelope_letter",
    "name": "信封抽片",
    "type": "combo",
    "category": "reference_creative",
    "description": "已开启的信封露出照片，向上抽片后扩至全屏",
    "durationFrames": 48,
    "atoms": [
      {
        "type": "visualProgress",
        "from": 0,
        "to": 1,
        "startFrame": 0,
        "endFrame": 48,
        "easing": "linear"
      }
    ],
    "visual": "envelopeLetter",
    "enabled": true
  },
  {
    "id": "reference_parcel_unwrap",
    "name": "牛皮纸拆封",
    "type": "combo",
    "category": "reference_creative",
    "description": "四片牛皮包装纸向外展开，露出中心画片",
    "durationFrames": 48,
    "atoms": [
      {
        "type": "visualProgress",
        "from": 0,
        "to": 1,
        "startFrame": 0,
        "endFrame": 48,
        "easing": "linear"
      }
    ],
    "visual": "parcelUnwrap",
    "enabled": true
  },
  {
    "id": "reference_accordion_letter",
    "name": "三折信展开",
    "type": "combo",
    "category": "reference_creative",
    "description": "横向三折信纸沿两道折痕翻平，恢复完整图像",
    "durationFrames": 48,
    "atoms": [
      {
        "type": "visualProgress",
        "from": 0,
        "to": 1,
        "startFrame": 0,
        "endFrame": 48,
        "easing": "linear"
      }
    ],
    "visual": "accordionLetter",
    "enabled": true
  },
  {
    "id": "reference_postcard_turn",
    "name": "明信片侧翻",
    "type": "combo",
    "category": "reference_creative",
    "description": "带邮票的明信片从侧面翻正并推近镜头",
    "durationFrames": 48,
    "atoms": [
      {
        "type": "visualProgress",
        "from": 0,
        "to": 1,
        "startFrame": 0,
        "endFrame": 48,
        "easing": "linear"
      }
    ],
    "visual": "postcardTurn",
    "enabled": true
  },
  {
    "id": "reference_ticket_perforation",
    "name": "票根撕开",
    "type": "combo",
    "category": "reference_creative",
    "description": "票根沿虚线斜向撕离，纸屑落下并露出主画面",
    "durationFrames": 48,
    "atoms": [
      {
        "type": "visualProgress",
        "from": 0,
        "to": 1,
        "startFrame": 0,
        "endFrame": 48,
        "easing": "linear"
      }
    ],
    "visual": "ticketPerforation",
    "enabled": true
  },
  {
    "id": "reference_instant_print",
    "name": "即影打印",
    "type": "combo",
    "category": "reference_creative",
    "description": "照片从打印口缓慢推出，色彩随显影恢复",
    "durationFrames": 48,
    "atoms": [
      {
        "type": "visualProgress",
        "from": 0,
        "to": 1,
        "startFrame": 0,
        "endFrame": 48,
        "easing": "linear"
      }
    ],
    "visual": "instantPrint",
    "enabled": true
  },
  {
    "id": "reference_scrapbook_assemble",
    "name": "手账贴画",
    "type": "combo",
    "category": "reference_creative",
    "description": "纸页、白边照片和两段和纸胶带依次贴合",
    "durationFrames": 48,
    "atoms": [
      {
        "type": "visualProgress",
        "from": 0,
        "to": 1,
        "startFrame": 0,
        "endFrame": 48,
        "easing": "linear"
      }
    ],
    "visual": "scrapbookAssemble",
    "enabled": true
  },
  {
    "id": "reference_paper_airplane",
    "name": "纸飞机展翼",
    "type": "combo",
    "category": "reference_creative",
    "description": "折成飞机形的图像斜向滑入，两侧纸翼展开成原图",
    "durationFrames": 48,
    "atoms": [
      {
        "type": "visualProgress",
        "from": 0,
        "to": 1,
        "startFrame": 0,
        "endFrame": 48,
        "easing": "linear"
      }
    ],
    "visual": "paperAirplane",
    "enabled": true
  }
];
