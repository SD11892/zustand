type Object = Record<string, any>

export default function shallow<T extends any, U extends any>(
  objA: T,
  objB: U
) {
  if (Object.is(objA, objB)) {
    return true
  }
  if (
    typeof objA !== 'object' ||
    objA === null ||
    typeof objB !== 'object' ||
    objB === null
  ) {
    return false
  }
  const keysA = Object.keys(objA as object)
  if (keysA.length !== Object.keys(objB as object).length) {
    return false
  }
  for (let i = 0; i < keysA.length; i++) {
    if (
      !Object.prototype.hasOwnProperty.call(objB, keysA[i]) ||
      !Object.is((objA as Object)[keysA[i]], (objB as Object)[keysA[i]])
    ) {
      return false
    }
  }
  return true
}
