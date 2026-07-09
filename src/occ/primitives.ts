/**
 * Built-in CAD primitives, each returning a `TopoDS_Shape`. These exercise the
 * range of OpenCASCADE face types: analytic (sphere/torus/cylinder/cone) and,
 * once fillets or fusions are involved, genuine free-form NURBS faces.
 *
 * Overload suffixes (`_1`, `_2`, …) follow OCCT header declaration order and
 * mirror the usage in the opencascade.js examples.
 */
import type { OpenCascade, Shape } from './types'

export function makeSphere(oc: OpenCascade, radius = 1): Shape {
  return new oc.BRepPrimAPI_MakeSphere_1(radius).Shape()
}

export function makeBox(oc: OpenCascade, dx = 1.5, dy = 1, dz = 1): Shape {
  return new oc.BRepPrimAPI_MakeBox_2(dx, dy, dz).Shape()
}

export function makeCylinder(oc: OpenCascade, radius = 0.7, height = 1.6): Shape {
  return new oc.BRepPrimAPI_MakeCylinder_1(radius, height).Shape()
}

export function makeCone(oc: OpenCascade, r1 = 0.9, r2 = 0.25, height = 1.5): Shape {
  return new oc.BRepPrimAPI_MakeCone_1(r1, r2, height).Shape()
}

export function makeTorus(oc: OpenCascade, major = 1, minor = 0.35): Shape {
  return new oc.BRepPrimAPI_MakeTorus_1(major, minor).Shape()
}

/** A box with all edges rounded — introduces free-form NURBS fillet faces. */
export function makeFilletBox(oc: OpenCascade, dx = 1.4, dy = 1, dz = 1, radius = 0.22): Shape {
  const box = new oc.BRepPrimAPI_MakeBox_2(dx, dy, dz).Shape()
  const mkFillet = new oc.BRepFilletAPI_MakeFillet(box, oc.ChFi3d_FilletShape.ChFi3d_Rational)
  const exp = new oc.TopExp_Explorer_2(
    box,
    oc.TopAbs_ShapeEnum.TopAbs_EDGE,
    oc.TopAbs_ShapeEnum.TopAbs_SHAPE,
  )
  while (exp.More()) {
    mkFillet.Add_2(radius, oc.TopoDS.Edge_1(exp.Current()))
    exp.Next()
  }
  exp.delete()
  return mkFillet.Shape()
}

/**
 * The classic OpenCASCADE "bottle" tutorial shape (filleted body + threaded
 * neck), adapted from opencascade.js-examples. A rich mix of planar, swept and
 * lofted faces — a good stress test for tessellation and NURBS extraction.
 */
export function makeBottle(oc: OpenCascade, myWidth = 1.0, myHeight = 1.4, myThickness = 0.6): Shape {
  const aPnt1 = new oc.gp_Pnt_3(-myWidth / 2, 0, 0)
  const aPnt2 = new oc.gp_Pnt_3(-myWidth / 2, -myThickness / 4, 0)
  const aPnt3 = new oc.gp_Pnt_3(0, -myThickness / 2, 0)
  const aPnt4 = new oc.gp_Pnt_3(myWidth / 2, -myThickness / 4, 0)
  const aPnt5 = new oc.gp_Pnt_3(myWidth / 2, 0, 0)

  const anArcOfCircle = new oc.GC_MakeArcOfCircle_4(aPnt2, aPnt3, aPnt4)
  const aSegment1 = new oc.GC_MakeSegment_1(aPnt1, aPnt2)
  const aSegment2 = new oc.GC_MakeSegment_1(aPnt4, aPnt5)

  const anEdge1 = new oc.BRepBuilderAPI_MakeEdge_24(new oc.Handle_Geom_Curve_2(aSegment1.Value().get()))
  const anEdge2 = new oc.BRepBuilderAPI_MakeEdge_24(new oc.Handle_Geom_Curve_2(anArcOfCircle.Value().get()))
  const anEdge3 = new oc.BRepBuilderAPI_MakeEdge_24(new oc.Handle_Geom_Curve_2(aSegment2.Value().get()))
  const aWire = new oc.BRepBuilderAPI_MakeWire_4(anEdge1.Edge(), anEdge2.Edge(), anEdge3.Edge())

  const xAxis = oc.gp.OX()
  const aTrsf = new oc.gp_Trsf_1()
  aTrsf.SetMirror_2(xAxis)
  const aBRepTrsf = new oc.BRepBuilderAPI_Transform_2(aWire.Wire(), aTrsf, false)
  const aMirroredShape = aBRepTrsf.Shape()

  const mkWire = new oc.BRepBuilderAPI_MakeWire_1()
  mkWire.Add_2(aWire.Wire())
  mkWire.Add_2(oc.TopoDS.Wire_1(aMirroredShape))
  const myWireProfile = mkWire.Wire()

  const myFaceProfile = new oc.BRepBuilderAPI_MakeFace_15(myWireProfile, false)
  const aPrismVec = new oc.gp_Vec_4(0, 0, myHeight)
  let myBody: Shape = new oc.BRepPrimAPI_MakePrism_1(myFaceProfile.Face(), aPrismVec, false, true)

  const mkFillet = new oc.BRepFilletAPI_MakeFillet(myBody.Shape(), oc.ChFi3d_FilletShape.ChFi3d_Rational)
  const anEdgeExplorer = new oc.TopExp_Explorer_2(
    myBody.Shape(),
    oc.TopAbs_ShapeEnum.TopAbs_EDGE,
    oc.TopAbs_ShapeEnum.TopAbs_SHAPE,
  )
  while (anEdgeExplorer.More()) {
    const anEdge = oc.TopoDS.Edge_1(anEdgeExplorer.Current())
    mkFillet.Add_2(myThickness / 12, anEdge)
    anEdgeExplorer.Next()
  }
  myBody = mkFillet.Shape()

  const neckLocation = new oc.gp_Pnt_3(0, 0, myHeight)
  const neckAxis = oc.gp.DZ()
  const neckAx2 = new oc.gp_Ax2_3(neckLocation, neckAxis)
  const myNeckRadius = myThickness / 4
  const myNeckHeight = myHeight / 10
  const MKCylinder = new oc.BRepPrimAPI_MakeCylinder_3(neckAx2, myNeckRadius, myNeckHeight)
  const myNeck = MKCylinder.Shape()
  myBody = new oc.BRepAlgoAPI_Fuse_3(myBody, myNeck, new oc.Message_ProgressRange_1())

  return myBody.Shape()
}
