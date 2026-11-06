const { useRef, useEffect, useState } = valenced.react.React
const { Animated, View, Dimensions } = valenced.react.ReactNative

const STAR_COUNT = 40
const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window')

interface Star {
	x: any
	y: any
	opacity: any
	length: number
	height: number
	speed: number
	angle: number
	color: string
}

function createStar(): Star {
	const h = 1.5 + Math.random() * 2
	const angle = 30 + Math.random() * 30
	const speed = 1200 + Math.random() * 1800
	const colors = [
		'rgba(255,255,255,1)',
		'rgba(220,230,255,1)',
		'rgba(255,245,220,1)',
	]
	return {
		x: new Animated.Value(0),
		y: new Animated.Value(0),
		opacity: new Animated.Value(0),
		length: 40 + Math.random() * 80,
		height: h,
		speed,
		angle,
		color: colors[Math.floor(Math.random() * colors.length)],
	}
}

function animateStar(star: Star) {
	const rad = (star.angle * Math.PI) / 180
	const travel =
		Math.sqrt(SCREEN_WIDTH * SCREEN_WIDTH + SCREEN_HEIGHT * SCREEN_HEIGHT) + 300

	const sx = -100 - Math.random() * 150
	const sy = -100 - Math.random() * 200
	const ex = sx + Math.cos(rad) * travel
	const ey = sy + Math.sin(rad) * travel

	star.x.setValue(sx)
	star.y.setValue(sy)
	star.opacity.setValue(0)

	Animated.parallel([
		Animated.timing(star.x, {
			toValue: ex,
			duration: star.speed,
			useNativeDriver: true,
		}),
		Animated.timing(star.y, {
			toValue: ey,
			duration: star.speed,
			useNativeDriver: true,
		}),
		Animated.sequence([
			Animated.timing(star.opacity, {
				toValue: 1,
				duration: star.speed * 0.08,
				useNativeDriver: true,
			}),
			Animated.delay(star.speed * 0.6),
			Animated.timing(star.opacity, {
				toValue: 0,
				duration: star.speed * 0.32,
				useNativeDriver: true,
			}),
		]),
	]).start(() => animateStar(star))
}

function Meteor({ star }: { star: Star }) {
	return (
		<Animated.View
			style={{
				position: 'absolute' as const,
				width: star.length,
				height: star.height,
				borderRadius: star.height / 2,
				backgroundColor: star.color,
				transform: [
					{ translateX: star.x },
					{ translateY: star.y },
					{ rotate: `${star.angle}deg` },
				],
				opacity: star.opacity,
			}}
		/>
	)
}

export default function FallingStars({ active }: { active: boolean }) {
	const [stars, setStars] = useState<Star[]>([])
	const starsRef = useRef<Star[]>([])

	useEffect(() => {
		if (!active) return

		const created = Array.from({ length: STAR_COUNT }, () => {
			const star = createStar()
			animateStar(star)
			return star
		})
		starsRef.current = created
		setStars(created)

		return () => {
			starsRef.current.forEach(s => {
				s.x.stopAnimation()
				s.y.stopAnimation()
				s.opacity.stopAnimation()
			})
		}
	}, [active])

	if (!active || stars.length === 0) return null

	return (
		<View
			style={{
				position: 'absolute' as const,
				top: 0,
				left: 0,
				right: 0,
				bottom: 0,
				pointerEvents: 'none' as const,
				overflow: 'hidden' as const,
			}}
			pointerEvents="none"
		>
			{stars.map((star, i) => (
				<Meteor key={i} star={star} />
			))}
		</View>
	)
}
