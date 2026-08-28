import L from 'leaflet';

export const pos = (position: { x: number; z: number }): L.LatLngExpression => {
  return [position.z, position.x];
};

export const applyRotation = (latLng: L.LatLng, rotation?: number) => {
  if (!latLng.lng && !latLng.lat) {
    return L.latLng(0, 0);
  }
  if (!rotation) {
    return latLng;
  }
  const angleInRadians = (rotation * Math.PI) / 180;
  const cosAngle = Math.cos(angleInRadians);
  const sinAngle = Math.sin(angleInRadians);
  const { lng: x, lat: y } = latLng;
  const rotatedX = x * cosAngle - y * sinAngle;
  const rotatedY = x * sinAngle + y * cosAngle;
  return L.latLng(rotatedY, rotatedX);
};

export const getCRS = (mapData: InteractiveMap.Data) => {
  let scaleX = 1;
  let scaleY = 1;
  let marginX = 0;
  let marginY = 0;
  if (mapData.transform) {
    scaleX = mapData.transform[0];
    scaleY = mapData.transform[2] * -1;
    marginX = mapData.transform[1];
    marginY = mapData.transform[3];
  }
  return L.extend({}, L.CRS.Simple, {
    transformation: new L.Transformation(scaleX, marginX, scaleY, marginY),
    projection: L.extend({}, L.Projection.LonLat, {
      project: (latLng: L.LatLng) => {
        return L.Projection.LonLat.project(applyRotation(latLng, mapData.coordinateRotation));
      },
      unproject: (point: L.Point) => {
        return applyRotation(
          L.Projection.LonLat.unproject(point),
          (mapData.coordinateRotation || 0) * -1,
        );
      },
    }),
  });
};

export const getBounds = (bounds?: number[][]) => {
  if (!bounds || bounds.length < 2) {
    return undefined;
  }
  const corners = bounds.filter((point) => Array.isArray(point) && point.length >= 2);
  if (corners.length < 2) {
    return undefined;
  }
  return L.latLngBounds(
    [corners[0][1], corners[0][0]],
    [corners[1][1], corners[1][0]],
  );
};

export const getScaledBounds = (bounds: number[][], scaleFactor: number) => {
  const centerX = (bounds[0][0] + bounds[1][0]) / 2;
  const centerY = (bounds[0][1] + bounds[1][1]) / 2;
  const width = bounds[1][0] - bounds[0][0];
  const height = bounds[1][1] - bounds[0][1];
  const newWidth = width * scaleFactor;
  const newHeight = height * scaleFactor;
  return [
    [centerY - newHeight / 2, centerX - newWidth / 2],
    [centerY + newHeight / 2, centerX + newWidth / 2],
  ] as L.LatLngBoundsLiteral;
};

export const gameLatLng = (latLng: L.LatLng): InteractiveMap.Position2D => {
  return { x: latLng.lng, y: latLng.lat };
};
