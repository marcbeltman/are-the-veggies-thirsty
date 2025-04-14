function showImageBasedOnValue(value) {
    const imageContainer = document.getElementById('image-container');
    imageContainer.innerHTML = ''; // Clear previous image

    let imagePath = '';

    if (value >= 80) {
        imagePath = 'images/01-veggies-excited-very-wet.png';
    } else if (value >= 60) {
        imagePath = 'images/02-veggies-happy-wet.png';
    } else if (value >= 40) {
        imagePath = 'images/03-veggies-neutral-normal.png';
    } else if (value >= 20) {
        imagePath = 'images/04-veggies-thirsty-dry.png';
    } else {
        imagePath = 'images/05-veggies-dieing-very-dry.png';
    }

    const img = document.createElement('img');
    img.src = imagePath;
    img.alt = 'Soil moisture level';
    imageContainer.appendChild(img);
}

