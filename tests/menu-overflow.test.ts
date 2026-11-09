import { packTitlebarMenuOverflow } from '@/widgets/chrome/menu-overflow'

const widths = [48, 56, 40, 48, 64]

describe('packTitlebarMenuOverflow', () => {
  it('показывает все пункты, если они помещаются без кнопки', () => {
    expect(packTitlebarMenuOverflow({ itemWidths: widths, available: 400, overflowWidth: 22, gap: 2 })).toEqual({
      shown: 5,
      used: 48 + 56 + 40 + 48 + 64 + 2 * 4
    })
  })

  it('прячет хвост в «…», оставляя место под кнопку', () => {
    expect(packTitlebarMenuOverflow({ itemWidths: widths, available: 160, overflowWidth: 22, gap: 2 })).toEqual({
      shown: 2,
      used: 48 + 2 + 56
    })
  })

  it('сворачивает всё в кнопку меню, когда скрытых пунктов слишком много', () => {
    expect(packTitlebarMenuOverflow({ itemWidths: widths, available: 70, overflowWidth: 22, gap: 2 })).toEqual({
      shown: 0,
      used: 0
    })
  })
})
