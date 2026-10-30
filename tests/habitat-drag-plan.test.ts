import { describe, expect, it } from 'vitest'
import { habitatDragPoint } from '../src/checkmate/habitat-drag'

describe('habitat drag point', () => {
 it('keeps the same source grab offset while positioning the habitat center', () => {
  const rect={left:100,top:200,width:48,height:48}
  expect(habitatDragPoint(rect,{x:8,y:30},{x:108,y:230})).toEqual({x:124,y:224})
  expect(habitatDragPoint(rect,{x:8,y:30},{x:308,y:430})).toEqual({x:324,y:424})
 })
})
